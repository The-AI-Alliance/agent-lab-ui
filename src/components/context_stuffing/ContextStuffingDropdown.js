// src/components/context_stuffing/ContextStuffingDropdown.js
import React, { useState } from 'react';
import { Button, Menu, MenuItem } from '@mui/material';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';

const ContextStuffingDropdown = ({ onOptionSelected, disabled }) => {
    const [anchorEl, setAnchorEl] = useState(null);
    const open = Boolean(anchorEl);


    const handleClick = (event) => {
        setAnchorEl(event.currentTarget);
    };

    const handleClose = () => {
        setAnchorEl(null);
    };

    const handleSelect = (option) => {
        onOptionSelected(option);
        handleClose();
    };

    return (
        <div>
            <Button
                id="context-stuffing-button"
                aria-controls={open ? 'context-stuffing-menu' : undefined}
                aria-haspopup="true"
                aria-expanded={open ? 'true' : undefined}
                variant="outlined"
                color="secondary"
                onClick={handleClick}
                endIcon={<ArrowDropDownIcon />}
                disabled={disabled}
                sx={{ height: '100%', alignSelf: 'stretch', ml: 1 }}
            >
                Stuff Context
            </Button>
            <Menu
                id="context-stuffing-menu"
                anchorEl={anchorEl}
                open={open}
                onClose={handleClose}
                MenuListProps={{
                    'aria-labelledby': 'context-stuffing-button',
                }}
            >
                <MenuItem onClick={() => handleSelect('webpage')}>Web Page (Raw)</MenuItem>
                <MenuItem onClick={() => handleSelect('gitrepo')}>Git Repository</MenuItem>
                <MenuItem onClick={() => handleSelect('pdf')}>PDF Document</MenuItem>
                <MenuItem onClick={() => handleSelect('image')}>Image</MenuItem>
            </Menu>
        </div>
    );
};

export default ContextStuffingDropdown;  