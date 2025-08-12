import React from 'react';
import { Link as RouterLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useThemeSwitcher } from '../../contexts/ThemeContext';

import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import Box from '@mui/material/Box';

import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import AccountCircle from '@mui/icons-material/AccountCircle';
import { useTheme } from '@mui/material/styles';
import InfoIcon from "@mui/icons-material/Info";

const Navbar = () => {
    const { currentUser, logout } = useAuth();
    const { selectTheme, isThemeFixedByConfig } = useThemeSwitcher();
    const navigate = useNavigate();
    const location = useLocation();
    const muiTheme = useTheme();

    const [anchorEl, setAnchorEl] = React.useState(null);
    const [themeMenuAnchorEl, setThemeMenuAnchorEl] = React.useState(null);

    const handleMenu = (event) => {
        setAnchorEl(event.currentTarget);
    };

    const handleClose = () => {
        setAnchorEl(null);
    };

    const handleThemeMenuOpen = (event) => {
        setThemeMenuAnchorEl(event.currentTarget);
    };

    const handleThemeMenuClose = () => {
        setThemeMenuAnchorEl(null);
    };

    const handleSelectTheme = (themeKey) => {
        selectTheme(themeKey);
        handleThemeMenuClose();
    };

    const handleLogout = async () => {
        try {
            await logout();
            navigate('/');
        } catch (error) {
            console.error("Failed to log out", error);
        }
        handleClose();
    };

    const navItems = [
        { path: '/projects', label: 'Projects' },
        { path: '/models', label: 'Models' },
        { path: '/agents', label: 'Agents' },
        { path: '/tools', label: 'Tools' },
    ];

    return (
        <AppBar position="fixed" color="primary" enableColorOnDark>
            <Toolbar>
                <Typography
                    variant="h6"
                    component={RouterLink}
                    to={currentUser ? "/projects" : "/"}
                    sx={{ color: 'inherit', textDecoration: 'none', mr: 2 }}
                >
                    {muiTheme.customBranding?.appName || 'AgentLabUI'}
                </Typography>

                {currentUser && (
                    <Box sx={{ flexGrow: 1, display: { xs: 'none', sm: 'block' } }}>
                        {navItems.map((item) => (
                            <Button
                                key={item.path}
                                component={RouterLink}
                                to={item.path}
                                sx={{
                                    color: 'white',
                                    fontWeight: location.pathname.startsWith(item.path) ? 'bold' : 'normal',
                                    borderBottom: location.pathname.startsWith(item.path) ? '2px solid' : 'none',
                                    borderRadius: 0,
                                    mx: 1
                                }}
                            >
                                {item.label}
                            </Button>
                        ))}
                    </Box>
                )}
                <Box sx={{ flexGrow: 1, display: { xs: 'block', sm: 'none' } }} />


                {!isThemeFixedByConfig && (
                    <>
                        <Button
                            aria-controls="theme-menu"
                            aria-haspopup="true"
                            onClick={handleThemeMenuOpen}
                            color="inherit"
                            startIcon={muiTheme.palette.mode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
                        >
                            Theme
                        </Button>
                        <Menu
                            id="theme-menu"
                            anchorEl={themeMenuAnchorEl}
                            keepMounted
                            open={Boolean(themeMenuAnchorEl)}
                            onClose={handleThemeMenuClose}
                        >
                            <MenuItem onClick={() => handleSelectTheme('default')}>Default</MenuItem>
                            <MenuItem onClick={() => handleSelectTheme('clientA')}>Client A</MenuItem>
                            <MenuItem onClick={() => handleSelectTheme('clientB')}>Client B</MenuItem>
                            <MenuItem onClick={() => handleSelectTheme('carbon')}>Carbon</MenuItem>
                        </Menu>
                    </>
                )}

                {currentUser ? (
                    <>
                        <IconButton
                            size="large"
                            aria-label="account of current user"
                            aria-controls="menu-appbar"
                            aria-haspopup="true"
                            onClick={handleMenu}
                            color="inherit"
                        >
                            <AccountCircle />
                        </IconButton>
                        <Menu
                            id="menu-appbar"
                            anchorEl={anchorEl}
                            anchorOrigin={{
                                vertical: 'top',
                                horizontal: 'right',
                            }}
                            keepMounted
                            transformOrigin={{
                                vertical: 'top',
                                horizontal: 'right',
                            }}
                            open={Boolean(anchorEl)}
                            onClose={handleClose}
                        >
                            <Box sx={{ display: { xs: 'block', sm: 'none' }, px: 2, py: 1 }}>
                                {navItems.map((item) => (
                                    <MenuItem key={`mobile-${item.path}`} component={RouterLink} to={item.path} onClick={handleClose}>
                                        {item.label}
                                    </MenuItem>
                                ))}
                            </Box>
                            <MenuItem component={RouterLink} to="/settings" onClick={handleClose}>Settings</MenuItem>
                            <MenuItem component={RouterLink} to="/about" onClick={handleClose}>
                                <InfoIcon sx={{ mr: 1 }} fontSize="small" />
                                About
                            </MenuItem>
                            {currentUser.permissions?.isAdmin && (
                                <MenuItem component={RouterLink} to="/admin" onClick={handleClose} >
                                    <AdminPanelSettingsIcon sx={{ mr: 1 }} fontSize="small" />
                                    Admin Panel
                                </MenuItem>
                            )}
                            <MenuItem onClick={handleLogout}>Logout</MenuItem>
                        </Menu>
                    </>
                ) : (
                    <Button color="inherit" component={RouterLink} to="/">
                        Login
                    </Button>
                )}
            </Toolbar>
        </AppBar>
    );
};

export default Navbar;