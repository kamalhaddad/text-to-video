import asyncio
import logging
import os
import tempfile
import torch
from datetime import datetime
from typing import Callable, Optional, Dict, Any
import numpy as np
from diffusers import MochiPipeline
from diffusers.utils import export_to_video
from models import VideoGenerationRequest
from pathlib import Path
import time


class VideoGenerator:
    """Handles video generation using the Mochi model"""
    
    def __init__(self, 
                 model_id: str = "genmo/mochi-1-preview",
                 device: str = "cuda",
                 cache_dir: str = "./model_cache"):
        self.model_id = model_id
        self.device = device
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(exist_ok=True)
        self.pipeline = None
        self.logger = logging.getLogger(__name__)
        self._lock = asyncio.Lock()
        
        logging.info(f"Initialized VideoGenerator on {device}")
    
    def load_model(self) -> bool:
        """Load the video generation model"""
        try:
            self.logger.info(f"Loading Mochi model {self.model_id}...")
            
            # Load the pipeline with memory optimizations
            self.pipeline = MochiPipeline.from_pretrained(
                self.model_id,
                variant="bf16",
                torch_dtype=torch.bfloat16,
                cache_dir=str(self.cache_dir)
            )
            
            # Move to device
            self.pipeline = self.pipeline.to(self.device)
            
            # Enable memory efficient optimizations
            self.pipeline.enable_model_cpu_offload()
            self.pipeline.enable_vae_tiling()
                
            self.logger.info("Mochi model loaded successfully")
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to load model: {str(e)}")
            return False
    
    def generate_video(self, 
                      prompt: str,
                      negative_prompt: str = "",
                      num_frames: int = 85,
                      height: int = 480,
                      width: int = 848,
                      num_inference_steps: int = 64,
                      guidance_scale: float = 4.5,
                      seed: Optional[int] = None,
                      progress_callback: Optional[Callable[[int, int, str], None]] = None) -> Optional[str]:
        """
        Generate a video from text prompt using Mochi
        
        Args:
            prompt: Text description of the video
            negative_prompt: What to avoid in the video
            num_frames: Number of frames to generate (default 85 for ~3 seconds at 30fps)
            height: Video height (default 480 for Mochi)
            width: Video width (default 848 for Mochi)
            num_inference_steps: Number of denoising steps (default 64 for Mochi)
            guidance_scale: How closely to follow the prompt (default 4.5 for Mochi)
            seed: Random seed for reproducible results
            progress_callback: Function to call with progress updates
            
        Returns:
            Path to generated video file or None if failed
        """
        
        if not self.pipeline:
            if not self.load_model():
                return None
        
        try:
            # Set seed for reproducibility
            generator = None
            if seed is not None:
                generator = torch.Generator(device=self.device).manual_seed(seed)
            
            # Generate timestamp for unique filename
            timestamp = int(time.time())
            output_path = f"./outputs/video_{timestamp}.mp4"
            
            self.logger.info(f"Generating video: {prompt[:50]}...")
            
            if progress_callback:
                progress_callback(0, 100, "Starting video generation...")
            
            # Create custom callback for progress updates
            def pipeline_callback(self_pipe, step: int, timestep: int, callback_kwargs):
                if progress_callback:
                    progress = int((step / num_inference_steps) * 90)  # Reserve 10% for post-processing
                    progress_callback(progress, 100, f"Generating step {step+1}/{num_inference_steps}")
                return callback_kwargs
            
            # Generate video with autocast for memory efficiency
            with torch.autocast(device_type="cuda", dtype=torch.bfloat16, cache_enabled=False):
                result = self.pipeline(
                    prompt=prompt,
                    negative_prompt=negative_prompt if negative_prompt else "",
                    height=height,
                    width=width,
                    num_frames=num_frames,
                    num_inference_steps=num_inference_steps,
                    guidance_scale=guidance_scale,
                    generator=generator,
                    callback_on_step_end=pipeline_callback,
                    callback_on_step_end_tensor_inputs=["latents"],
                    output_type="pil"
                )
            
            if progress_callback:
                progress_callback(90, 100, "Processing video output...")
            
            # Export video frames to MP4
            frames = result.frames[0]
            export_to_video(frames, output_path, fps=30)
            
            if progress_callback:
                progress_callback(100, 100, "Video generation completed!")
            
            self.logger.info(f"Video generated successfully: {output_path}")
            return output_path
            
        except Exception as e:
            self.logger.error(f"Video generation failed: {str(e)}")
            if progress_callback:
                progress_callback(-1, 100, f"Error: {str(e)}")
            return None
    
    def get_model_info(self) -> Dict[str, Any]:
        """Get information about the loaded model"""
        return {
            "model_id": self.model_id,
            "device": self.device,
            "cache_dir": str(self.cache_dir),
            "loaded": self.pipeline is not None,
            "pipeline_type": "Mochi"
        }
    
    def cleanup(self):
        """Clean up model resources"""
        if self.pipeline:
            del self.pipeline
            self.pipeline = None
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            self.logger.info("Model cleanup completed")


class VideoGeneratorPool:
    """Manages a pool of video generators for different GPUs"""
    
    def __init__(self):
        self.generators: dict[str, VideoGenerator] = {}
        self._lock = asyncio.Lock()
    
    async def get_generator(self, device: str) -> VideoGenerator:
        """Get or create a video generator for the specified GPU"""
        async with self._lock:
            if device not in self.generators:
                self.generators[device] = VideoGenerator(device=device)
            return self.generators[device]
    
    async def cleanup_all(self):
        """Cleanup all generators"""
        async with self._lock:
            for generator in self.generators.values():
                generator.cleanup()
            self.generators.clear()


# Global generator pool
generator_pool = VideoGeneratorPool() 