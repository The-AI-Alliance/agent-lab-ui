// src/utils/agentValidation.js
const AGENT_NAME_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const RESERVED_AGENT_NAME = "user";

export function validateAgentName(name) {
    if (!name || !name.trim()) { return "Agent Name is required."; }
    if (/\s/.test(name)) { return "Agent Name cannot contain spaces."; }
    if (!AGENT_NAME_REGEX.test(name)) { return "Agent Name must start with a letter or underscore, and can only contain letters, digits, or underscores."; }
    if (name.toLowerCase() === RESERVED_AGENT_NAME) { return `Agent Name cannot be "${RESERVED_AGENT_NAME}" as it's a reserved name.`; }
    if (name.length > 63) { return "Agent Name is too long (max 63 characters)."; }
    return null;
}