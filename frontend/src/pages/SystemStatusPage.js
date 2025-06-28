import React from 'react';
import { useQuery } from 'react-query';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Alert,
  CircularProgress,
  LinearProgress,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
} from '@mui/material';
import {
  Memory as MemoryIcon,
  Storage as StorageIcon,
  Computer as ComputerIcon,
  Refresh as RefreshIcon,
  Speed as SpeedIcon,
} from '@mui/icons-material';
import { apiService, formatFileSize } from '../services/api';

const SystemStatusPage = () => {
  const {
    data: systemStatus,
    isLoading,
    error,
    refetch,
  } = useQuery(
    'systemStatus',
    () => apiService.getSystemStatus(),
    {
      refetchInterval: 10000, // Auto-refresh every 10 seconds
    }
  );

  const {
    data: healthStatus,
    isLoading: healthLoading,
  } = useQuery(
    'health',
    () => apiService.healthCheck(),
    {
      refetchInterval: 30000, // Check health every 30 seconds
    }
  );

  const getMemoryUsageColor = (percent) => {
    if (percent < 50) return 'success';
    if (percent < 80) return 'warning';
    return 'error';
  };

  const getUtilizationColor = (percent) => {
    if (percent < 30) return 'primary';
    if (percent < 70) return 'warning';
    return 'error';
  };

  if (error) {
    return (
      <Alert severity="error">
        Error loading system status: {error.response?.data?.detail || error.message}
      </Alert>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          System Status
        </Typography>
        <Button
          startIcon={<RefreshIcon />}
          onClick={() => refetch()}
          disabled={isLoading}
        >
          Refresh
        </Button>
      </Box>

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Grid container spacing={3}>
          {/* Health Status */}
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Service Health
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Chip
                    label={healthLoading ? 'Checking...' : (healthStatus?.status || 'Unknown')}
                    color={healthStatus?.status === 'healthy' ? 'success' : 'error'}
                    icon={healthLoading ? <CircularProgress size={16} /> : undefined}
                  />
                  {healthStatus && (
                    <Typography variant="body2" color="text.secondary">
                      Available GPUs: {healthStatus.available_gpus} | 
                      Active Jobs: {healthStatus.active_jobs} | 
                      Queue Length: {healthStatus.queue_length}
                    </Typography>
                  )}
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Job Statistics */}
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <SpeedIcon sx={{ mr: 1 }} />
                  <Typography variant="h6">Job Queue</Typography>
                </Box>
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Typography variant="h4" color="primary">
                      {systemStatus?.active_jobs || 0}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Active Jobs
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="h4" color="warning.main">
                      {systemStatus?.queue_length || 0}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Queued Jobs
                    </Typography>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          {/* GPU Overview */}
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <ComputerIcon sx={{ mr: 1 }} />
                  <Typography variant="h6">GPU Resources</Typography>
                </Box>
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Typography variant="h4" color="success.main">
                      {systemStatus?.available_gpus || 0}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Available GPUs
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="h4" color="info.main">
                      {systemStatus?.system_load?.gpu_info?.total_gpus || 0}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Total GPUs
                    </Typography>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          {/* System Resources */}
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <MemoryIcon sx={{ mr: 1 }} />
                  <Typography variant="h6">System Resources</Typography>
                </Box>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" gutterBottom>
                    CPU Usage: {Math.round(systemStatus?.system_load?.cpu_percent || 0)}%
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={systemStatus?.system_load?.cpu_percent || 0}
                    color={getUtilizationColor(systemStatus?.system_load?.cpu_percent || 0)}
                  />
                </Box>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" gutterBottom>
                    Memory Usage: {Math.round(systemStatus?.system_load?.memory_percent || 0)}%
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={systemStatus?.system_load?.memory_percent || 0}
                    color={getMemoryUsageColor(systemStatus?.system_load?.memory_percent || 0)}
                  />
                </Box>
                <Typography variant="body2" color="text.secondary">
                  Available Memory: {formatFileSize((systemStatus?.system_load?.memory_available_gb || 0) * 1024 ** 3)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Free Disk: {formatFileSize((systemStatus?.system_load?.disk_free_gb || 0) * 1024 ** 3)}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* GPU Details */}
          {systemStatus?.system_load?.gpu_info?.gpu_details && (
            <Grid item xs={12}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    GPU Details
                  </Typography>
                  <TableContainer component={Paper} variant="outlined">
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell>GPU ID</TableCell>
                          <TableCell>Name</TableCell>
                          <TableCell>Memory Usage</TableCell>
                          <TableCell>GPU Utilization</TableCell>
                          <TableCell>Memory Utilization</TableCell>
                          <TableCell>Allocated To</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {systemStatus.system_load.gpu_info.gpu_details.map((gpu) => (
                          <TableRow key={gpu.gpu_id}>
                            <TableCell>{gpu.gpu_id}</TableCell>
                            <TableCell>{gpu.name}</TableCell>
                            <TableCell>
                              <Box sx={{ minWidth: 200 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                  <Typography variant="body2">
                                    {formatFileSize(gpu.memory_used)} / {formatFileSize(gpu.memory_total)}
                                  </Typography>
                                  <Typography variant="body2">
                                    {Math.round((gpu.memory_used / gpu.memory_total) * 100)}%
                                  </Typography>
                                </Box>
                                <LinearProgress
                                  variant="determinate"
                                  value={(gpu.memory_used / gpu.memory_total) * 100}
                                  color={getMemoryUsageColor((gpu.memory_used / gpu.memory_total) * 100)}
                                />
                              </Box>
                            </TableCell>
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="body2">
                                  {gpu.utilization_gpu}%
                                </Typography>
                                <LinearProgress
                                  variant="determinate"
                                  value={gpu.utilization_gpu}
                                  sx={{ width: 100 }}
                                  color={getUtilizationColor(gpu.utilization_gpu)}
                                />
                              </Box>
                            </TableCell>
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="body2">
                                  {gpu.utilization_memory}%
                                </Typography>
                                <LinearProgress
                                  variant="determinate"
                                  value={gpu.utilization_memory}
                                  sx={{ width: 100 }}
                                  color={getUtilizationColor(gpu.utilization_memory)}
                                />
                              </Box>
                            </TableCell>
                            <TableCell>
                              {gpu.allocated_to_job ? (
                                <Chip
                                  label={`Job ${gpu.allocated_to_job.substring(0, 8)}...`}
                                  size="small"
                                  color="primary"
                                />
                              ) : (
                                <Chip
                                  label="Available"
                                  size="small"
                                  color="success"
                                />
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </CardContent>
              </Card>
            </Grid>
          )}

          {/* System Information */}
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  System Information
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">
                      Total GPUs
                    </Typography>
                    <Typography variant="h6">
                      {systemStatus?.system_load?.gpu_info?.total_gpus || 0}
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">
                      Available GPUs
                    </Typography>
                    <Typography variant="h6">
                      {systemStatus?.system_load?.gpu_info?.available_gpus || 0}
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">
                      Allocated GPUs
                    </Typography>
                    <Typography variant="h6">
                      {systemStatus?.system_load?.gpu_info?.allocated_gpus || 0}
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">
                      Model
                    </Typography>
                    <Typography variant="h6">
                      Mochi-1
                    </Typography>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          {/* Performance Metrics */}
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Performance Metrics
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">
                      Average Generation Time
                    </Typography>
                    <Typography variant="h6">
                      ~5-8 min
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">
                      Throughput (per GPU)
                    </Typography>
                    <Typography variant="h6">
                      1 video/5min
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">
                      Memory per Job
                    </Typography>
                    <Typography variant="h6">
                      ~12GB VRAM
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">
                      Max Concurrent Jobs
                    </Typography>
                    <Typography variant="h6">
                      {Math.floor((systemStatus?.system_load?.gpu_info?.total_gpus || 0) / 2)} jobs
                    </Typography>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}
    </Box>
  );
};

export default SystemStatusPage; 