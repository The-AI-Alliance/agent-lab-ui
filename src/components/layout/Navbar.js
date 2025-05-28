import React from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useThemeSwitcher } from '../../contexts/ThemeContext';

import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings'; // For Admin link

import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import AccountCircle from '@mui/icons-material/AccountCircle';
import { useTheme } from '@mui/material/styles';

const Navbar = () => {
    const { currentUser, logout } = useAuth();
    const { selectTheme, currentThemeKey } = useThemeSwitcher();
    const navigate = useNavigate();
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

    return (
        <AppBar position="fixed" color="primary" enableColorOnDark>
            <Toolbar>
                <Typography
                    variant="h6"
                    component={RouterLink}
                    to="/"
                    sx={{ flexGrow: 1, color: 'inherit', textDecoration: 'none' }}
                >
                    {muiTheme.customBranding?.appName || 'AgentLabUI'}
                </Typography>

                <Button
                    aria-controls="theme-menu"
                    aria-haspopup="true"
                    onClick={handleThemeMenuOpen}
                    color="inherit"
                    startIcon={muiTheme.palette.mode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
                >
                    Theme: {currentThemeKey}
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
                    <MenuItem onClick={() => handleSelectTheme('carbonUI')}>CarbonUI</MenuItem>
                </Menu>

                {currentUser ? (
                    <>

                        <Button color="inherit" component={RouterLink} to="/dashboard">
                            Dashboard
                        </Button>
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
                            <MenuItem component={RouterLink} to="/settings" onClick={handleClose}>Settings</MenuItem>
                            {currentUser.permissions?.isAdmin && ( // Check for admin permission
                                <MenuItem
                                    component={RouterLink}
                                    to="/admin"
                                    onClick={handleClose}
                                >
                                    <AdminPanelSettingsIcon sx={{ mr: 1 }} fontSize="small" />
                                    Admin Panel
                                </MenuItem>
                            )}
                            <MenuItem onClick={handleLogout}>Logout ({currentUser.displayName || currentUser.email?.split('@')[0]})</MenuItem>
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