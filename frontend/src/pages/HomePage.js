import React, { useState } from 'react';
import { useMutation, useQueryClient } from 'react-query';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Grid,
  Alert,
  CircularProgress,
  Slider,
  FormControlLabel,
  Switch,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Paper,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SendIcon from '@mui/icons-material/Send';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import { apiService } from '../services/api';

const HomePage = () => {
  const [prompt, setPrompt] = useState('');
  const [advancedSettings, setAdvancedSettings] = useState({
    num_frames: 84,
    guidance_scale: 7.5,
    num_inference_steps: 50,
    fps: 30,
    width: 848,
    height: 480,
    seed: null,
  });
  const [useAdvanced, setUseAdvanced] = useState(false);
  const [useSeed, setUseSeed] = useState(false);

  const queryClient = useQueryClient();

  const submitJobMutation = useMutation(
    (jobData) => apiService.submitJob(jobData),
    {
      onSuccess: (data) => {
        setPrompt('');
        queryClient.invalidateQueries('jobs');
        // You could navigate to the job details or show success message
      },
    }
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!prompt.trim()) {
      return;
    }

    const jobData = {
      prompt: prompt.trim(),
      ...(useAdvanced ? advancedSettings : {}),
      ...(useSeed && advancedSettings.seed ? { seed: parseInt(advancedSettings.seed) } : {}),
    };

    submitJobMutation.mutate(jobData);
  };

  const handleAdvancedChange = (field, value) => {
    setAdvancedSettings(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const examplePrompts = [
    "A cat walking through a magical forest with glowing mushrooms",
    "Ocean waves crashing against rocks during a golden sunset",
    "A futuristic city with flying cars and neon lights",
    "Cherry blossoms falling in a peaceful Japanese garden",
    "A dragon flying over a medieval castle",
  ];

  return (
    <Box>
      <Paper elevation={1} sx={{ p: 3, mb: 4, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <SmartToyIcon sx={{ fontSize: 40, mr: 2 }} />
          <Typography variant="h1" component="h1">
            Text-to-Video Generator
          </Typography>
        </Box>
        <Typography variant="h6" sx={{ opacity: 0.9 }}>
          Transform your imagination into stunning videos using the power of AI
        </Typography>
      </Paper>

      <Grid container spacing={4}>
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="h5" component="h2" gutterBottom>
                Generate Video
              </Typography>
              
              <form onSubmit={handleSubmit}>
                <TextField
                  fullWidth
                  multiline
                  rows={4}
                  label="Describe your video"
                  placeholder="Enter a detailed description of the video you want to generate..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  variant="outlined"
                  sx={{ mb: 3 }}
                  disabled={submitJobMutation.isLoading}
                />

                <FormControlLabel
                  control={
                    <Switch
                      checked={useAdvanced}
                      onChange={(e) => setUseAdvanced(e.target.checked)}
                    />
                  }
                  label="Advanced Settings"
                  sx={{ mb: 2 }}
                />

                {useAdvanced && (
                  <Accordion sx={{ mb: 3 }}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Typography>Advanced Generation Parameters</Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                      <Grid container spacing={3}>
                        <Grid item xs={12} sm={6}>
                          <Typography gutterBottom>
                            Number of Frames: {advancedSettings.num_frames}
                          </Typography>
                          <Slider
                            value={advancedSettings.num_frames}
                            onChange={(_, value) => handleAdvancedChange('num_frames', value)}
                            min={1}
                            max={163}
                            step={1}
                            marks={[
                              { value: 1, label: '1' },
                              { value: 84, label: '84' },
                              { value: 163, label: '163' },
                            ]}
                          />
                        </Grid>
                        
                        <Grid item xs={12} sm={6}>
                          <Typography gutterBottom>
                            Guidance Scale: {advancedSettings.guidance_scale}
                          </Typography>
                          <Slider
                            value={advancedSettings.guidance_scale}
                            onChange={(_, value) => handleAdvancedChange('guidance_scale', value)}
                            min={1.0}
                            max={20.0}
                            step={0.5}
                            marks={[
                              { value: 1.0, label: '1.0' },
                              { value: 7.5, label: '7.5' },
                              { value: 20.0, label: '20.0' },
                            ]}
                          />
                        </Grid>

                        <Grid item xs={12} sm={6}>
                          <Typography gutterBottom>
                            Inference Steps: {advancedSettings.num_inference_steps}
                          </Typography>
                          <Slider
                            value={advancedSettings.num_inference_steps}
                            onChange={(_, value) => handleAdvancedChange('num_inference_steps', value)}
                            min={10}
                            max={100}
                            step={5}
                            marks={[
                              { value: 10, label: '10' },
                              { value: 50, label: '50' },
                              { value: 100, label: '100' },
                            ]}
                          />
                        </Grid>

                        <Grid item xs={12} sm={6}>
                          <Typography gutterBottom>
                            FPS: {advancedSettings.fps}
                          </Typography>
                          <Slider
                            value={advancedSettings.fps}
                            onChange={(_, value) => handleAdvancedChange('fps', value)}
                            min={1}
                            max={60}
                            step={1}
                            marks={[
                              { value: 1, label: '1' },
                              { value: 30, label: '30' },
                              { value: 60, label: '60' },
                            ]}
                          />
                        </Grid>

                        <Grid item xs={12} sm={6}>
                          <TextField
                            fullWidth
                            label="Width"
                            type="number"
                            value={advancedSettings.width}
                            onChange={(e) => handleAdvancedChange('width', parseInt(e.target.value))}
                            inputProps={{ min: 256, max: 1024, step: 64 }}
                          />
                        </Grid>

                        <Grid item xs={12} sm={6}>
                          <TextField
                            fullWidth
                            label="Height"
                            type="number"
                            value={advancedSettings.height}
                            onChange={(e) => handleAdvancedChange('height', parseInt(e.target.value))}
                            inputProps={{ min: 256, max: 1024, step: 64 }}
                          />
                        </Grid>

                        <Grid item xs={12}>
                          <FormControlLabel
                            control={
                              <Switch
                                checked={useSeed}
                                onChange={(e) => setUseSeed(e.target.checked)}
                              />
                            }
                            label="Use Random Seed"
                          />
                          {useSeed && (
                            <TextField
                              fullWidth
                              label="Seed"
                              type="number"
                              value={advancedSettings.seed || ''}
                              onChange={(e) => handleAdvancedChange('seed', e.target.value)}
                              sx={{ mt: 2 }}
                            />
                          )}
                        </Grid>
                      </Grid>
                    </AccordionDetails>
                  </Accordion>
                )}

                {submitJobMutation.isError && (
                  <Alert severity="error" sx={{ mb: 2 }}>
                    Error submitting job: {submitJobMutation.error?.response?.data?.detail || submitJobMutation.error?.message}
                  </Alert>
                )}

                {submitJobMutation.isSuccess && (
                  <Alert severity="success" sx={{ mb: 2 }}>
                    Job submitted successfully! Job ID: {submitJobMutation.data?.job_id}
                  </Alert>
                )}

                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  startIcon={submitJobMutation.isLoading ? <CircularProgress size={20} /> : <SendIcon />}
                  disabled={!prompt.trim() || submitJobMutation.isLoading}
                  fullWidth
                >
                  {submitJobMutation.isLoading ? 'Generating Video...' : 'Generate Video'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Example Prompts
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Try these example prompts to get started:
              </Typography>
              
              {examplePrompts.map((example, index) => (
                <Paper
                  key={index}
                  sx={{
                    p: 2,
                    mb: 1,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    '&:hover': {
                      backgroundColor: 'primary.main',
                      color: 'primary.contrastText',
                      transform: 'translateY(-2px)',
                    },
                  }}
                  onClick={() => setPrompt(example)}
                >
                  <Typography variant="body2">
                    {example}
                  </Typography>
                </Paper>
              ))}
            </CardContent>
          </Card>

          <Card sx={{ mt: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                How it Works
              </Typography>
              <Typography variant="body2" color="text.secondary">
                1. Enter a detailed text description of your desired video
              </Typography>
              <Typography variant="body2" color="text.secondary">
                2. Optionally adjust advanced parameters
              </Typography>
              <Typography variant="body2" color="text.secondary">
                3. Click "Generate Video" to submit your job
              </Typography>
              <Typography variant="body2" color="text.secondary">
                4. Monitor progress on the Jobs page
              </Typography>
              <Typography variant="body2" color="text.secondary">
                5. Download your video when complete
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default HomePage; 