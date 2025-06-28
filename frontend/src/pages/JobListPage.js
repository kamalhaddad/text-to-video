import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { format } from 'date-fns';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
  Grid,
  Alert,
  CircularProgress,
  LinearProgress,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  Download as DownloadIcon,
  Refresh as RefreshIcon,
  Cancel as CancelIcon,
  Info as InfoIcon,
  PlayArrow as PlayIcon,
} from '@mui/icons-material';
import { apiService, downloadBlob, formatDuration } from '../services/api';

const JobListPage = () => {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedJob, setSelectedJob] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const queryClient = useQueryClient();

  // Query for jobs list
  const {
    data: jobsData,
    isLoading,
    error,
    refetch,
  } = useQuery(
    ['jobs', page, statusFilter],
    () => apiService.listJobs({ 
      page, 
      page_size: 10, 
      status_filter: statusFilter || undefined 
    }),
    {
      refetchInterval: 5000, // Auto-refresh every 5 seconds
      keepPreviousData: true,
    }
  );

  // Mutation for canceling jobs
  const cancelJobMutation = useMutation(
    (jobId) => apiService.cancelJob(jobId),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('jobs');
      },
    }
  );

  // Mutation for downloading videos
  const downloadMutation = useMutation(
    async (jobId) => {
      const response = await apiService.downloadVideo(jobId);
      const filename = `video_${jobId}.mp4`;
      downloadBlob(response.data, filename);
      return filename;
    }
  );

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'warning';
      case 'processing': return 'info';
      case 'completed': return 'success';
      case 'failed': return 'error';
      default: return 'default';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'processing': return <CircularProgress size={16} />;
      case 'completed': return <PlayIcon />;
      default: return null;
    }
  };

  const handleDownload = (jobId) => {
    downloadMutation.mutate(jobId);
  };

  const handleCancel = (jobId) => {
    if (window.confirm('Are you sure you want to cancel this job?')) {
      cancelJobMutation.mutate(jobId);
    }
  };

  const handleViewDetails = (job) => {
    setSelectedJob(job);
    setDetailsOpen(true);
  };

  const canCancel = (status) => {
    return status === 'pending' || status === 'processing';
  };

  const canDownload = (status) => {
    return status === 'completed';
  };

  if (error) {
    return (
      <Alert severity="error">
        Error loading jobs: {error.response?.data?.detail || error.message}
      </Alert>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Video Generation Jobs
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Status Filter</InputLabel>
            <Select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              label="Status Filter"
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="pending">Pending</MenuItem>
              <MenuItem value="processing">Processing</MenuItem>
              <MenuItem value="completed">Completed</MenuItem>
              <MenuItem value="failed">Failed</MenuItem>
            </Select>
          </FormControl>
          <Button
            startIcon={<RefreshIcon />}
            onClick={() => refetch()}
            disabled={isLoading}
          >
            Refresh
          </Button>
        </Box>
      </Box>

      {jobsData?.jobs?.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 8 }}>
            <Typography variant="h6" color="text.secondary">
              No jobs found
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Submit your first video generation job from the Home page
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Job ID</TableCell>
                  <TableCell>Prompt</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Progress</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell>Duration</TableCell>
                  <TableCell align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} sx={{ textAlign: 'center', py: 4 }}>
                      <CircularProgress />
                    </TableCell>
                  </TableRow>
                ) : (
                  jobsData?.jobs?.map((job) => (
                    <TableRow key={job.job_id} hover>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                          {job.job_id.substring(0, 8)}...
                        </Typography>
                      </TableCell>
                      
                      <TableCell>
                        <Typography variant="body2" sx={{ maxWidth: 200 }}>
                          {job.parameters?.prompt?.substring(0, 50)}
                          {job.parameters?.prompt?.length > 50 && '...'}
                        </Typography>
                      </TableCell>
                      
                      <TableCell>
                        <Chip
                          icon={getStatusIcon(job.status)}
                          label={job.status}
                          color={getStatusColor(job.status)}
                          size="small"
                        />
                      </TableCell>
                      
                      <TableCell>
                        {job.status === 'processing' && job.progress !== null ? (
                          <Box sx={{ width: 100 }}>
                            <LinearProgress
                              variant="determinate"
                              value={job.progress}
                              sx={{ mb: 1 }}
                            />
                            <Typography variant="caption">
                              {Math.round(job.progress)}%
                            </Typography>
                          </Box>
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            {job.status === 'completed' ? '100%' : '-'}
                          </Typography>
                        )}
                      </TableCell>
                      
                      <TableCell>
                        <Typography variant="body2">
                          {format(new Date(job.created_at), 'MMM dd, HH:mm')}
                        </Typography>
                      </TableCell>
                      
                      <TableCell>
                        <Typography variant="body2">
                          {job.completed_at && job.started_at ? 
                            formatDuration(
                              Math.floor(
                                (new Date(job.completed_at) - new Date(job.started_at)) / 1000
                              )
                            ) : 
                            job.started_at ? 
                              formatDuration(
                                Math.floor((new Date() - new Date(job.started_at)) / 1000)
                              ) : 
                              '-'
                          }
                        </Typography>
                      </TableCell>
                      
                      <TableCell align="center">
                        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1 }}>
                          <Tooltip title="View Details">
                            <IconButton
                              size="small"
                              onClick={() => handleViewDetails(job)}
                            >
                              <InfoIcon />
                            </IconButton>
                          </Tooltip>
                          
                          {canDownload(job.status) && (
                            <Tooltip title="Download Video">
                              <IconButton
                                size="small"
                                onClick={() => handleDownload(job.job_id)}
                                disabled={downloadMutation.isLoading}
                                color="primary"
                              >
                                <DownloadIcon />
                              </IconButton>
                            </Tooltip>
                          )}
                          
                          {canCancel(job.status) && (
                            <Tooltip title="Cancel Job">
                              <IconButton
                                size="small"
                                onClick={() => handleCancel(job.job_id)}
                                disabled={cancelJobMutation.isLoading}
                                color="error"
                              >
                                <CancelIcon />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {jobsData && jobsData.total_pages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
              <Pagination
                count={jobsData.total_pages}
                page={page}
                onChange={(event, value) => setPage(value)}
                color="primary"
              />
            </Box>
          )}
        </>
      )}

      {/* Job Details Dialog */}
      <Dialog
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Job Details: {selectedJob?.job_id}
        </DialogTitle>
        <DialogContent>
          {selectedJob && (
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom>
                  Prompt
                </Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  {selectedJob.parameters?.prompt}
                </Typography>
              </Grid>
              
              <Grid item xs={6}>
                <Typography variant="subtitle2">Status</Typography>
                <Chip
                  icon={getStatusIcon(selectedJob.status)}
                  label={selectedJob.status}
                  color={getStatusColor(selectedJob.status)}
                />
              </Grid>
              
              <Grid item xs={6}>
                <Typography variant="subtitle2">Progress</Typography>
                <Typography variant="body2">
                  {selectedJob.progress !== null ? `${Math.round(selectedJob.progress)}%` : '-'}
                </Typography>
              </Grid>
              
              <Grid item xs={6}>
                <Typography variant="subtitle2">Created</Typography>
                <Typography variant="body2">
                  {format(new Date(selectedJob.created_at), 'PPpp')}
                </Typography>
              </Grid>
              
              <Grid item xs={6}>
                <Typography variant="subtitle2">Started</Typography>
                <Typography variant="body2">
                  {selectedJob.started_at ? 
                    format(new Date(selectedJob.started_at), 'PPpp') : 
                    'Not started'
                  }
                </Typography>
              </Grid>
              
              {selectedJob.completed_at && (
                <Grid item xs={6}>
                  <Typography variant="subtitle2">Completed</Typography>
                  <Typography variant="body2">
                    {format(new Date(selectedJob.completed_at), 'PPpp')}
                  </Typography>
                </Grid>
              )}
              
              {selectedJob.error_message && (
                <Grid item xs={12}>
                  <Typography variant="subtitle2">Error Message</Typography>
                  <Alert severity="error" sx={{ mt: 1 }}>
                    {selectedJob.error_message}
                  </Alert>
                </Grid>
              )}
              
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
                  Generation Parameters
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Typography variant="subtitle2">Frames</Typography>
                    <Typography variant="body2">{selectedJob.parameters?.num_frames}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="subtitle2">FPS</Typography>
                    <Typography variant="body2">{selectedJob.parameters?.fps}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="subtitle2">Resolution</Typography>
                    <Typography variant="body2">
                      {selectedJob.parameters?.width} × {selectedJob.parameters?.height}
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="subtitle2">Guidance Scale</Typography>
                    <Typography variant="body2">{selectedJob.parameters?.guidance_scale}</Typography>
                  </Grid>
                </Grid>
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          {selectedJob && canDownload(selectedJob.status) && (
            <Button
              startIcon={<DownloadIcon />}
              onClick={() => {
                handleDownload(selectedJob.job_id);
                setDetailsOpen(false);
              }}
              disabled={downloadMutation.isLoading}
            >
              Download Video
            </Button>
          )}
          <Button onClick={() => setDetailsOpen(false)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Download/Cancel status alerts */}
      {downloadMutation.isSuccess && (
        <Alert severity="success" sx={{ mt: 2 }}>
          Video downloaded successfully!
        </Alert>
      )}
      
      {downloadMutation.isError && (
        <Alert severity="error" sx={{ mt: 2 }}>
          Error downloading video: {downloadMutation.error?.message}
        </Alert>
      )}
      
      {cancelJobMutation.isSuccess && (
        <Alert severity="info" sx={{ mt: 2 }}>
          Job cancelled successfully
        </Alert>
      )}
    </Box>
  );
};

export default JobListPage; 