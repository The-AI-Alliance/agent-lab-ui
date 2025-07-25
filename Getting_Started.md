# Getting Started with AgentLabUI

Welcome to AgentLabUI! This guide provides two clear paths to get AgentLabUI up and running. Choose the approach that best fits your needs.

## Choose Your Path

### 🚀 Path A: GitHub Actions Deployment (Recommended)
**Best for:** Most users, especially those who want automated deployments and don't need local development.
- Fork the repository and configure GitHub secrets
- Automatic deployment via GitHub Actions
- No local setup required beyond basic Firebase project creation

### 💻 Path B: Local Development & Manual Deployment
**Best for:** Developers who want to modify code, debug locally, or prefer manual control.
- Full local development environment
- Manual deployment using Firebase CLI
- Complete control over the build and deployment process

---

## Table of Contents

1. [Prerequisites (Both Paths)](#prerequisites-both-paths)
2. [Firebase Project Setup (Both Paths)](#firebase-project-setup-both-paths)
3. [Path A: GitHub Actions Deployment](#path-a-github-actions-deployment)
4. [Path B: Local Development & Manual Deployment](#path-b-local-development--manual-deployment)
5. [First Use & Configuration (Both Paths)](#first-use--configuration-both-paths)
6. [User Roles and Permissions System](#user-roles-and-permissions-system)
7. [Available GitHub Workflows](#available-github-workflows)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites (Both Paths)

### Firebase Account
You'll need a Google account to create a Firebase project. Firebase offers a generous free tier, but some features (like Cloud Functions) may require upgrading to the Blaze (pay-as-you-go) plan.

---

## Firebase Project Setup (Both Paths)

This project uses Firebase for authentication, database, backend functions, and hosting.

### Create a Firebase Project

1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Click on "**Add project**".
3. Enter a name for your project (e.g., `my-agentlab-ui`).
4. Accept the Firebase terms and click "**Continue**".
5. You can choose to enable Google Analytics or not (it's optional for this project). Click "**Continue**" or "**Create project**".
6. Wait for your project to be created.

### Register a Web App & Get Config

1. Once your project is ready, click the "**Web**" icon ( `</>` ) to add a Firebase app to your project.
2. Enter an "App nickname" (e.g., "AgentLabUI Web App").
3. **Do NOT check** the box for "Also set up Firebase Hosting for this app" at this stage. We'll configure hosting later.
4. Click "**Register app**".
5. Firebase will display an SDK setup snippet. Under "Add Firebase SDK", you'll see a `firebaseConfig` object. **Copy this entire object.** It will look like this:
   ```javascript
   const firebaseConfig = {
     apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXX",
     authDomain: "your-project-id.firebaseapp.com",
     projectId: "your-project-id",
     storageBucket: "your-project-id.appspot.com",
     messagingSenderId: "123456789012",
     appId: "1:123456789012:web:abcdef1234567890abcdef",
     measurementId: "G-ABCDEFGHIJ" // Optional
   };
   ```
   **Save this configuration** - you'll need it for both deployment paths.
6. Click "**Continue to console**".

### Enable Authentication

1. In your Firebase project console, go to "**Authentication**" (in the "Build" section of the left-hand menu).
2. Click "**Get started**".
3. Under the "**Sign-in method**" tab, click on "**Google**" from the list of providers.
4. Enable Google Sign-in by toggling the switch.
5. Select a "Project support email".
6. Click "**Save**".

### Enable Firestore

1. Go to "**Firestore Database**" (in the "Build" section).
2. Click "**Create database**".
3. Choose a "Cloud Firestore location" (e.g., `us-central1`). **This cannot be changed later.**
4. Choose "**Start in production mode**" or "**Start in test mode**". Either selection is fine, since you will update the rules in the next step.
5. Click "**Enable**".
6. Once it has finished provisioning, click on the tab 'Rules' and copy and paste the contents of [./firestore.rules](firestore.rules)
7. Click 'Publish'

### Enable Firebase Functions

1. Go to "**Functions**" (in the "Build" section).
2. If this is your first time using Functions, you might be prompted to upgrade your project to the "Blaze (pay as you go)" plan. Firebase Functions (beyond the free tier) require this. Click "**Upgrade project**" and follow the steps to set up a billing account if you haven't already.
3. Once billing is set up, you should see the Functions dashboard. No further action is needed in the console for now.

### Enable Cloud Tasks (for Asynchronous Agent Runs)

AgentLabUI uses Google Cloud Tasks to run agent queries in the background. This allows the user interface to remain responsive while the agent processes complex requests.

1.  **Enable the Cloud Tasks API:**
   -   In the [Google Cloud Console](https://console.cloud.google.com/), select your project.
   -   Go to **APIs & Services > Library**.
   -   Search for `Cloud Tasks API` and click **Enable**.

2.  **Create the Task Queue:**
    -   In the Google Cloud Console, navigate to **Cloud Tasks**.
    -   Click **Create Queue**.
    -   Select **Cloud Tasks (2nd gen)**.
    -   For **Queue name**, enter exactly `executeAgentRunTask`.
    -   For **Region**, choose the same location as your Firebase Functions (e.g., `us-central1`).
    -   Click **Create**.

3.  **Update IAM Permissions for the Service Account:** The service account that runs your Firebase Functions needs permission to create tasks.
    -   Go to **IAM & Admin > IAM**.
    -   Find the service account named `your-project-id@appspot.gserviceaccount.com`.
    -   Click the pencil icon (Edit principal) for this service account.
    -   Click **+ ADD ANOTHER ROLE** and add the following two roles:
        -   `Cloud Tasks Enqueuer`: Allows the function to add new tasks to the queue.
        -   `Owner`: Allows the service account to act as an account owner and all services. This should be replaced with the more precise roles.   
        -   `Service Account User`: Allows the service account to generate credentials for itself. which is required when creating tasks that invoke other Cloud Functions.  
    -   Click **Save**.

### Vertex AI Configuration (for Agent Deployment)

AgentLabUI allows you to deploy agents to Google Cloud's Vertex AI using the Agent Development Kit (ADK).

1. **Google Cloud Project:** Your Firebase project is also a Google Cloud Project. You can use this same project for Vertex AI.
2. **Enable Vertex AI API:**
   - Go to the [Google Cloud Console](https://console.cloud.google.com/).
   - Select your project.
   - In the navigation menu, go to "Vertex AI".
   - If it's your first time, click "**Enable Vertex AI API**" (or similar prompts to enable the API).
3. **IAM Permissions:** The Firebase Functions service account needs permissions to interact with Vertex AI and Cloud Storage.
   - In the Google Cloud Console, go to "IAM & Admin" -> "IAM".
   - Find the service account named `your-project-id@appspot.gserviceaccount.com`.
   - Click the pencil icon (Edit principal) for this service account.
   - Add the following roles:
     - `Vertex AI User` (for deploying and managing Vertex AI resources)
     - `Service Account User` (to allow the service account to act as itself, sometimes needed by ADK)
     - `Storage Object Admin` (for the ADK staging bucket, which will be `gs://your-project-id-adk-staging`)
   - Click "Save".
4. **Staging Bucket:** The application will attempt to use a Cloud Storage bucket named `gs://<your-project-id>-adk-staging`. This bucket is typically created automatically on the first ADK deployment if it doesn't exist and the service account has `Storage Admin` or sufficient creation permissions on the project level. If not, you might need to create it manually via the Cloud Storage console.

---

## Path A: GitHub Actions Deployment

This path uses automated GitHub Actions workflows to build and deploy your application without requiring local development setup.

### Step 1: Fork the Repository

1. Go to [The-AI-Alliance/agent-lab-ui](https://github.com/The-AI-Alliance/agent-lab-ui)
2. Click "Fork" to create your own copy
3. Clone your fork locally (optional, only if you want to make code changes):
   ```bash
   git clone https://github.com/YOUR-USERNAME/agent-lab-ui.git
   cd agent-lab-ui
   ```

### Step 2: Create Firebase Service Account

1. In Firebase Console > Project Settings > Service accounts
2. Click "Generate new private key"
3. Download the JSON file - you'll need its contents for GitHub secrets

### Step 3: Configure GitHub Secrets

In your forked repository on GitHub:

1. Go to **Settings** > **Secrets and variables** > **Actions**
2. Click **"New repository secret"** and add the following secrets:

#### Required Secrets

**`FIREBASE_CONFIG_JSON`**
- **Purpose:** Provides Firebase configuration for building and deployment
- **Content:** The complete `firebaseConfig` object from Firebase setup. **Remember to add the double quotes around the keys, as they will NOT be double quoted in the object from the Firebase setup**:
```json
{
  "apiKey": "your-api-key",
  "authDomain": "your-project.firebaseapp.com",
  "projectId": "your-project-id",
  "storageBucket": "your-project.appspot.com",
  "messagingSenderId": "123456789012",
  "appId": "1:123456789012:web:abcdef1234567890abcdef",
  "measurementId": "G-ABCDEFGHIJ"
}
```

**`FIREBASE_SERVICE_ACCOUNT_AGENT_WEB_UI`**
- **Purpose:** Service account key for deployment permissions
- **Content:** Paste the entire contents of the service account JSON file you downloaded
- **IAM Requirements:** Ensure this service account has "Firebase Hosting Admin" role in your Google Cloud project

#### Optional Secrets (for enhanced functionality)

**Additional API Keys:**
- `OPENAI_API_KEY`: For OpenAI integration
- `DEEPINFRA_API_KEY`: For DeepInfra integration
- `GITHUB_TOKEN`: For repository operations
- Additional AI provider keys as needed (see [agentConstants.js](https://github.com/The-AI-Alliance/agent-lab-ui/blob/main/src/constants/agentConstants.js) for complete list)

### Step 4: Deploy Using GitHub Actions

Choose your deployment method:

#### Automatic Deployment
- Push changes to `main` branch → Automatic deployment to live site
- Pull requests → Automatic preview deployments

#### Manual Deployment
1. Go to **Actions** tab in your repository
2. Run **"Deploy to My Fork"** workflow for hosting
3. Run **"Deploy Firebase Functions Manually"** for backend functions

### Step 5: Access Your Deployed Application

After successful deployment:
1. Check the GitHub Actions logs for the Firebase Hosting URL
2. Visit your deployed application
3. Proceed to [First Use & Configuration](#first-use--configuration-both-paths)

---

## Path B: Local Development & Manual Deployment

This path involves setting up a complete local development environment and using Firebase CLI for deployment.

### Step 1: Install Prerequisites

#### Node.js and npm
*Node.js is required for the React frontend.*

**Using Node Version Manager (recommended):**
```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Close and reopen terminal, then:
nvm install --lts
nvm use --lts

# Verify installation
node -v && npm -v
```

**Alternative:** Download from [Node.js official website](https://nodejs.org/).

#### Git
*Version control system for downloading the project.*

**OSX:**
```bash
xcode-select --install  # If not already installed
```

**Ubuntu:**
```bash
sudo apt update && sudo apt install git
```

**Verify:**
```bash
git --version
```

#### Python and pip
*Firebase Functions are written in Python.*

**OSX:** Python 3 usually comes pre-installed. Check with `python3 --version`.

**Ubuntu:**
```bash
sudo apt update && sudo apt install python3 python3-pip python3-venv
```

**Verify:**
```bash
python3 --version && pip3 --version
```

#### Firebase CLI
```bash
npm install -g firebase-tools
firebase --version
```

### Step 2: Clone and Configure Project

#### Clone Repository
```bash
git clone https://github.com/The-AI-Alliance/agent-lab-ui.git agentlabui
cd agentlabui
```

#### Configure Firebase for Frontend
1. Navigate to the `src` folder:
   ```bash
   cd src
   ```
2. Create `firebaseConfig.json`:
   ```bash
   # Create the file and paste your Firebase config
   ```
3. Add your Firebase configuration (the object you copied earlier):
   ```json
   {
     "apiKey": "YOUR_API_KEY",
     "authDomain": "YOUR_PROJECT_ID.firebaseapp.com",
     "projectId": "YOUR_PROJECT_ID",
     "storageBucket": "YOUR_PROJECT_ID.appspot.com",
     "messagingSenderId": "YOUR_MESSAGING_SENDER_ID",
     "appId": "YOUR_APP_ID",
     "measurementId": "YOUR_MEASUREMENT_ID"
   }
   ```
4. Navigate back to project root:
   ```bash
   cd ..
   ```

#### Install Dependencies
```bash
npm install
```

### Step 3: Initialize Firebase Project

#### Log in to Firebase
```bash
firebase login
```

#### Initialize Firebase
```bash
firebase init
```

**Configuration steps:**
1. **Features:** Select using spacebar:
   - ✅ Firestore: Configure security rules and indexes files
   - ✅ Functions: Configure a Cloud Functions directory
   - ✅ Hosting: Configure and deploy Firebase Hosting sites

2. **Project Setup:**
   - Choose "**Use an existing project**" and select your Firebase project

3. **Firestore Setup:**
   - "What file should be used for Firestore Rules?": Press Enter for default (`firestore.rules`)
   - "What file should be used for Firestore indexes?": Press Enter for default (`firestore.indexes.json`)

4. **Functions Setup:**
   - "What language would you like to use to write Cloud Functions?": Choose **Python**
   - "File functions/requirements.txt already exists. Overwrite?": **No**
   - "File functions/.gitignore already exists. Overwrite?": **No**
   - "Would you like to install dependencies now with pip?": **Yes**

5. **Hosting Setup:**
   - "What do you want to use as your public directory?": Type `build`
   - "Configure as a single-page app?": **Yes**
   - "Set up automatic builds and deploys with GitHub?": **No**
   - "File build/index.html already exists. Overwrite?": **No**

### Step 4: Local Development

#### Start Development Server
```bash
npm start
```

This opens the application at `http://localhost:3000`.

#### Handle Firestore Index Errors (Normal on First Run)

When using the application locally, you may encounter Firestore index errors. There are two approaches to handle this:

**Method 1: Deploy Indexes via Firebase CLI (Recommended)**
```bash
firebase deploy --only firestore
```
This deploys both the security rules and indexes defined in `firestore.indexes.json` to your Firebase project.

**Method 2: Manual Index Creation (Alternative)**
If you encounter index errors during application use:

1. Open browser Developer Tools (F12) → Console tab
2. Click on index creation links in error messages
3. Wait for indexes to build in Firebase Console (few minutes)
4. Reload the application
5. Repeat 2-3 times as additional indexes may be needed

**Note:** The required indexes are pre-defined in `firestore.indexes.json`. Using Method 1 ensures all necessary indexes are created at once, while Method 2 creates them on-demand as the application encounters queries requiring them.

This is normal for first-time setup as Firestore creates indexes on-demand, but pre-deploying them via CLI is more efficient.

### Step 5: Deploy to Firebase

#### Build for Production
```bash
npm run build
```

#### Deploy All Components
```bash
firebase deploy
```

#### Deploy Selectively (if needed)
```bash
# Deploy only hosting
firebase deploy --only hosting

# Deploy only functions
firebase deploy --only functions

# Deploy only Firestore rules
firebase deploy --only firestore:rules
```

#### Alternative: Use GitHub Actions
Even with local development, you can still use GitHub Actions for deployment:
- **Deploy Functions:** Run "Deploy Firebase Functions Manually" workflow
- **Deploy Hosting:** Run "Deploy to My Fork" workflow
- **Requirements:** Configure the GitHub secrets as described in Path A

### Step 6: Access Your Application

After deployment, Firebase CLI will output your application's URL. Visit it and proceed to the next section.

---

## First Use & Configuration (Both Paths)

### Initial Application Access

1. **Visit your deployed application:**
   - **Path A:** Use the URL from GitHub Actions deployment logs
   - **Path B:** Use the Firebase Hosting URL from `firebase deploy` output
   - **Local development:** `http://localhost:3000`

2. **First Login:**
   - Click "Login with Google" button
   - Use the Google account associated with your Firebase project

### Critical: Initial Admin Setup

**Important:** The first user needs admin permissions manually set in Firestore.

1. **Log in** to your AgentLabUI application (this creates your user document)
2. **Go to Firebase Console** > Firestore Database
3. **Navigate to the `users` collection**
4. **Find your user document** (ID matches your Firebase UID)
5. **Add a `permissions` field** (type: map) with these values:
   ```json
   permissions: {
     isAdmin: true,
     isAuthorized: true,
     canCreateAgent: true,
     canRunAgent: true
   }
   ```
6. **Log out and back in** to see admin features

### API Requirements

Enable these APIs in Google Cloud Console:
- **Cloud Build API** - For deploying functions
- **Vertex AI API** - For agent deployment

### Creating Your First Agent

1. **Access Create Agent:**
   - Click "Create New Agent" on dashboard, or
   - Use "+" button in navigation

2. **Basic Configuration:**
   - **Platform:** Choose `Google Vertex AI`
   - **Agent Name:** Descriptive name (required)
   - **Description:** Optional details
   - **Agent Type:** 
     - `Agent`: Standard single agent
     - `SequentialAgent`: Child agents run in sequence
     - `ParallelAgent`: Child agents run concurrently
     - `LoopAgent`: Repeats execution with max loops

3. **Model & Instructions:**
   - **Model:** Select Gemini model (e.g., `gemini-1.5-flash-001`)
   - **Instruction:** Define agent behavior with system prompt

4. **Tools Selection:**
   - **ADK Built-in Tools:** Google Search, Vertex AI Search
   - **Gofannon Tools:** Click "Refresh" to load available tools
   - **MCP Tools:** Load tools from MCP servers
   - **Code Execution:** Enable for compatible Gemini 2 models

5. **Create:** Click "Create Agent" button

### Example Agent Configurations

**Simple Assistant:**
```
Name: Basic Helper
Type: Agent
Model: gemini-1.5-flash-001
Instruction: You are a helpful assistant. Answer questions accurately and concisely.
Tools: None
```

**Research Agent:**
```
Name: Research Assistant
Type: Agent
Model: gemini-1.5-flash-001
Instruction: You are a research assistant. Use Google Search to find accurate information and summarize findings.
Tools: Google Search (ADK Built-in)
```

### Next Steps

After creating agents, you can:
- **Deploy to Vertex AI** for production use
- **Test in chat interface** for development
- **Edit configurations** as needed
- **View deployment status** and logs
- **Manage permissions** via Admin Panel

---

## User Roles and Permissions System

AgentLabUI includes a comprehensive user management system to control access to features.

### Overview

- **Users Collection:** User profiles stored in Firestore `users` collection
- **Permissions Field:** Each user has a `permissions` map with boolean flags:
  - `isAdmin`: Access to Admin Panel and user management
  - `isAuthorized`: Access to main application features
  - `canCreateAgent`: Permission to create agent configurations
  - `canRunAgent`: Permission to run deployed agents

### New User Workflow

1. **First Login:** Basic profile created without permissions
2. **Admin Review:** New users appear in "Users Awaiting Permission Setup"
3. **Permission Assignment:** Admin sets appropriate permissions
4. **Access Granted:** User can access features based on permissions

### Admin Panel Features

**Access:** Users with `isAdmin: true` see "Admin" link in navigation

**Functionality:**
- **User Management:** View all users awaiting permission setup
- **Permission Assignment:** Set individual user permissions via dialog
- **Bulk Operations:** Manage multiple users efficiently

### Firestore Security Rules

The security rules enforce the permission system:
- Users can update their own non-sensitive profile fields
- Only admins can read all user documents
- Only admins can update others' permissions
- Agent operations check relevant permissions (`canCreateAgent`, `canRunAgent`)

---

## Available GitHub Workflows

The project includes comprehensive GitHub Actions workflows for automation:

### Deployment Workflows

**`firebase-hosting-merge.yml`**
- **Trigger:** Push to `main` branch
- **Action:** Deploys to live Firebase Hosting channel
- **Requirements:** `FIREBASE_CONFIG_JSON`, `FIREBASE_SERVICE_ACCOUNT_AGENT_WEB_UI`

**`firebase-hosting-pull-request.yml`**
- **Trigger:** Pull requests to main repository
- **Action:** Creates preview deployment with unique URL
- **Security:** Only runs for internal PRs, not external forks

**`deploy-my-fork.yml`**
- **Trigger:** Manual workflow dispatch
- **Action:** Allows fork owners to deploy to their own Firebase project
- **Inputs:** Branch selection, channel ID customization

**`deploy-functions.yml`**
- **Trigger:** Manual workflow dispatch
- **Action:** Deploys Firebase Functions with environment secrets
- **Features:** Python environment setup, API key injection

### Management Workflows

**`create-release.yml`**
- **Trigger:** Manual with version input
- **Action:** Creates tagged releases with automated version management
- **Features:** Updates `public/version.json`, generates release notes

**`sync-upstream.yml`**
- **Trigger:** Manual with upstream tag input
- **Action:** Synchronizes forks with upstream changes
- **Features:** Conflict resolution, branch creation for review
- **Documentation:** See [docs/syncing.md](docs/syncing.md)

**`upstream-pr-checks.yml`**
- **Status:** Currently disabled
- **Purpose:** Code quality checks for pull requests
- **Planned:** Linting, testing, build verification

### Workflow Security

- **Conditional Execution:** Workflows only run when required secrets exist
- **Fork Protection:** External forks cannot access upstream secrets
- **Permission Scoping:** Each workflow has minimal required permissions

---

## Troubleshooting

### Common Issues

**Permission Errors (Firebase/GCP):**
- Ensure Firebase project is on Blaze plan for Functions
- Verify IAM roles for service account in Google Cloud Console
- Check Firestore security rules configuration

**GitHub Actions Failures:**
- Verify secrets are correctly formatted JSON
- Check Actions logs for specific error messages
- Ensure service account has proper Firebase permissions

**Local Development Issues:**
- **Missing `firebaseConfig.json`:** Create file with proper Firebase configuration
- **Function deployment errors:** Check Firebase Console Function logs
- **Python dependencies:** Verify `requirements.txt` and Python version compatibility

**Firestore Index Errors:**
- Normal on first run - follow console links to create indexes
- Allow time for index building (few minutes)
- Repeat process 2-3 times for all required indexes

**Agent Deployment Issues:**
- Verify Vertex AI API is enabled
- Check ADK staging bucket permissions
- Review Cloud Function logs for detailed error messages

**CORS Errors:**
- Firebase Callable Functions handle CORS automatically
- If encountered, check request configuration

### Getting Help

1. **Check Logs:**
   - Firebase Console → Functions → Logs
   - Google Cloud Console → Logging
   - GitHub Actions → Workflow logs

2. **Verify Configuration:**
   - Firebase project settings
   - IAM permissions
   - API enablement status

3. **Review Documentation:**
   - Firebase documentation for specific errors
   - Google Cloud Vertex AI documentation
   - GitHub Actions documentation

### Performance Tips

- **Cold Starts:** Firebase Functions may have cold start delays
- **Index Optimization:** Properly configured Firestore indexes improve query performance
- **Deployment Size:** Large deployments may take longer to propagate

---

## Advanced Configuration

### Custom Themes

AgentLabUI supports custom theming through the configuration system. Themes can be configured to match your organization's branding.

### MCP Integration

The application supports Model Context Protocol (MCP) for enhanced tool integration:
- Connect to external MCP servers
- Load tools dynamically from MCP endpoints
- Configure authentication for private MCP servers

### Multi-Environment Setup

For organizations requiring multiple environments:
- Use separate Firebase projects for development/staging/production
- Configure different GitHub repository secrets per environment
- Set up separate deployment workflows for each environment

---

That's it! You now have a comprehensive guide to get AgentLabUI running using either automated GitHub Actions deployment or local development. Choose the path that best fits your needs and start building AI agents! 🤖

### Quick Start Summary

**Path A (GitHub Actions):**
1. Fork repo → 2. Add GitHub secrets → 3. Deploy via Actions → 4. Set admin permissions

**Path B (Local Development):**
1. Install tools → 2. Clone & configure → 3. `npm start` → 4. `firebase deploy` → 5. Set admin permissions

Both paths lead to the same fully functional AgentLabUI installation. Happy agent building!