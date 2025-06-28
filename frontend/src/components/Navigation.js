import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Box } from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
import ListIcon from '@mui/icons-material/List';
import BarChartIcon from '@mui/icons-material/BarChart';

const Navigation = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = [
    { path: '/', label: 'Home', icon: <HomeIcon /> },
    { path: '/jobs', label: 'Jobs', icon: <ListIcon /> },
    { path: '/status', label: 'System Status', icon: <BarChartIcon /> },
  ];

  return (
    <Box sx={{ display: 'flex', gap: 1 }}>
      {navItems.map((item) => (
        <Button
          key={item.path}
          color="inherit"
          startIcon={item.icon}
          onClick={() => navigate(item.path)}
          sx={{
            borderRadius: 2,
            px: 2,
            backgroundColor: location.pathname === item.path ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
            '&:hover': {
              backgroundColor: 'rgba(255, 255, 255, 0.15)',
            },
          }}
        >
          {item.label}
        </Button>
      ))}
    </Box>
  );
};

export default Navigation; 