# Getting Started with AgentLabUI

Welcome to AgentLabUI! This guide will walk you through setting up the project on a fresh OSX or Ubuntu system. We'll cover everything from installing necessary tools to deploying the application, including automated deployments with GitHub Actions.

## Table of Contents

1.  [Prerequisites](#1-prerequisites)
    *   [Node.js and npm](#nodejs-and-npm)
    *   [Git](#git)
    *   [Python and pip](#python-and-pip)
    *   [Code Editor](#code-editor)
2.  [Firebase Project Setup](#2-firebase-project-setup)
    *   [Create a Firebase Project](#create-a-firebase-project)
    *   [Register a Web App & Get Config](#register-a-web-app--get-config)
    *   [Enable Authentication](#enable-authentication)
    *   [Enable Firestore](#enable-firestore)
    *   [Enable Firebase Functions](#enable-firebase-functions)
3.  [Local Project Setup](#3-local-project-setup)
    *   [Clone the Repository](#clone-the-repository)
    *   [Configure Firebase for the Frontend](#configure-firebase-for-the-frontend)
    *   [Install Frontend Dependencies](#install-frontend-dependencies)
    *   [Create Gofannon Manifest](#create-gofannon-manifest)
    *   [Install Firebase CLI](#install-firebase-cli)
    *   [Log in to Firebase CLI](#log-in-to-firebase-cli)
    *   [Initialize Firebase in Your Project](#initialize-firebase-in-your-project)
4.  [Vertex AI Configuration (for Agent Deployment)](#4-vertex-ai-configuration-for-agent-deployment)
5.  [Running and Deploying the Application (Manually)](#5-running-and-deploying-the-application-manually)
    *   [Run the Frontend (React App)](#run-the-frontend-react-app)
    *   [Deploy Firebase Components](#deploy-firebase-components)
6.  [Automated Deployments with GitHub Actions](#6-automated-deployments-with-github-actions)
    *   [Overview](#overview)
    *   [Required GitHub Secrets](#required-github-secrets)
    *   [How to Set GitHub Secrets](#how-to-set-github-secrets)
    *   [Workflow Details](#workflow-details)
    *   [Notes for Contributors and Forked Repositories](#notes-for-contributors-and-forked-repositories)
7.  [First Use](#7-first-use)
8.  [Troubleshooting (Common Issues)](#8-troubleshooting-common-issues)

---    

## 1. Prerequisites

Before you begin, you'll need to install a few tools.

### Node.js and npm

Node.js is a JavaScript runtime, and npm is its package manager.
*   **Recommendation:** Use Node Version Manager (nvm) to install Node.js and npm. This allows you to manage multiple Node.js versions easily.
    *   Open your terminal and run:
        ```bash    
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash    
        ```    
    *   Close and reopen your terminal, or source your shell profile (e.g., `source ~/.bashrc`, `source ~/.zshrc`).
    *   Install the latest LTS (Long Term Support) version of Node.js:
        ```bash    
        nvm install --lts    
        nvm use --lts    
        ```    
    *   Verify installation:
        ```bash    
        node -v    
        npm -v    
        ```    
*   **Alternative (Direct Install):** Download from [Node.js official website](https://nodejs.org/).

### Git

Git is a version control system used to download (clone) the project.
*   **OSX:** Git often comes pre-installed. If not, installing Xcode Command Line Tools will include it:
    ```bash    
    xcode-select --install    
    ```    
*   **Ubuntu:**
    ```bash    
    sudo apt update    
    sudo apt install git    
    ```    
*   Verify installation:
    ```bash    
    git --version    
    ```    

### Python and pip

Firebase Functions in this project are written in Python.
*   **OSX:** Python 3 usually comes pre-installed. Check with `python3 --version`. If you need to install or manage versions, consider [pyenv](https://github.com/pyenv/pyenv).
*   **Ubuntu:**
    ```bash    
    sudo apt update    
    sudo apt install python3 python3-pip python3-venv    
    ```    
*   Verify installation:
    ```bash    
    python3 --version    
    pip3 --version    
    ```    
    This project's functions use Python 3. Ensure your system's `python3` points to a compatible version (e.g., 3.9+).

### Code Editor

A good code editor will make development easier. We recommend Visual Studio Code (VS Code).
*   Download from [VS Code official website](https://code.visualstudio.com/).

---    

## 2. Firebase Project Setup

This project uses Firebase for authentication, database, backend functions, and hosting.

### Create a Firebase Project

1.  Go to the [Firebase Console](https://console.firebase.google.com/).
2.  Click on "**Add project**".
3.  Enter a name for your project (e.g., `my-agentlab-ui`).
4.  Accept the Firebase terms and click "**Continue**".
5.  You can choose to enable Google Analytics or not (it's optional for this project). Click "**Continue**" or "**Create project**".
6.  Wait for your project to be created.

### Register a Web App & Get Config

1.  Once your project is ready, click the "**Web**" icon ( `</>` ) to add a Firebase app to your project.
2.  Enter an "App nickname" (e.g., "AgentLabUI Web App").
3.  **Do NOT check** the box for "Also set up Firebase Hosting for this app" at this stage. We'll configure hosting later via the Firebase CLI.
4.  Click "**Register app**".
5.  Firebase will display an SDK setup snippet. Under "Add Firebase SDK", you'll see a `firebaseConfig` object. **Copy this entire object.** It will look like this:
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
    You will need these values for `src/firebaseConfig.json` in the next section, and also for GitHub Actions secrets if you enable automated deployments.
6.  Click "**Continue to console**".

### Enable Authentication

1.  In your Firebase project console, go to "**Authentication**" (in the "Build" section of the left-hand menu).
2.  Click "**Get started**".
3.  Under the "**Sign-in method**" tab, click on "**Google**" from the list of providers.
4.  Enable Google Sign-in by toggling the switch.
5.  Select a "Project support email".
6.  Click "**Save**".

### Enable Firestore

1.  Go to "**Realtime Database**" (in the "Build" section).
2.  Click "**Create database**".
3.  Choose a "Cloud Firestore location" (e.g., `us-central1`). **This cannot be changed later.**
4.  Choose "**Start in production mode**" or "**Start in test mode**". For initial development, "test mode" is easier but less secure. You can change rules later.
    *   **Test mode rule (expires in 30 days):**
        ```    
        rules_version = '2';    
        service cloud.firestore {    
          match /databases/{database}/documents {    
            match /{document=**} {    
              allow read, write: if request.time < timestamp.date(YEAR, MONTH, DAY+30);    
            }    
          }    
        }    
        ```    
    *   **Production mode (secure - recommended starting point):** We'll deploy actual rules later. For now, you can use this minimal rule that allows authenticated users to read/write their own data (adjust as needed for the app's logic):
        ```    
        rules_version = '2';    
        service cloud.firestore {    
          match /databases/{database}/documents {    
            // Example: Agents can be read by anyone, written only by owner    
            match /agents/{agentId} {    
              allow read: if true; // Or if request.auth != null;    
              allow create, update, delete: if request.auth != null && request.auth.uid == resource.data.userId;    
            }    
            // Example: Gofannon manifest readable by authenticated users    
            match /gofannonToolManifest/{docId} {    
               allow read: if request.auth != null;    
               allow write: if false; // Only functions should write this    
            }    
            // Default deny all other paths    
            match /{document=**} {    
              allow read, write: if false;    
            }    
          }    
        }    
        ```    
        **For simplicity during initial setup, you might start with test mode and then deploy stricter rules.**
5.  Click "**Enable**".

### Enable Firebase Functions

1.  Go to "**Functions**" (in the "Build" section).
2.  If this is your first time using Functions, you might be prompted to upgrade your project to the "Blaze (pay as you go)" plan. Firebase Functions (beyond the free tier) require this. Click "**Upgrade project**" and follow the steps to set up a billing account if you haven't already.
3.  Once billing is set up, you should see the Functions dashboard. No further action is needed in the console for now.

---    

## 3. Local Project Setup

Now, let's get the project code onto your computer and configure it.

### Clone the Repository

1.  Open your terminal.
2.  Navigate to the directory where you want to store the project (e.g., `cd ~/Developer`).
3.  Clone the project repository (replace `https://github.com/your-username/your-agentlabui-repo.git` with the actual repository URL of AgentLabUI, e.g., `https://github.com/AI-Citizen/agentlabui.git`):
    ```bash    
    git clone https://github.com/AI-Citizen/agentlabui.git agentlabui    
    cd agentlabui    
    ```    

### Configure Firebase for the Frontend

The frontend application needs your Firebase project's credentials.

1.  Inside the cloned project directory (`agentlabui`), navigate to the `src` folder:
    ```bash    
    cd src    
    ```    
2.  Create a new file named `firebaseConfig.json`.
3.  Open `src/firebaseConfig.json` in your code editor.
4.  Paste the `firebaseConfig` object you copied from the Firebase console earlier. It should look like this, but with **your actual values**:
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
5.  Save the `src/firebaseConfig.json` file. This file is listed in `.gitignore`, so your credentials won't be committed to Git.

### Install Frontend Dependencies

1.  Navigate back to the project's root directory:
    ```bash    
    cd ..    
    ```    
2.  Install the necessary Node.js packages for the React frontend:
    ```bash    
    npm install    
    ```    
    (If you prefer Yarn: `yarn install`)

### Create Gofannon Manifest

The backend functions expect a Gofannon tool manifest file.

1.  Navigate to the `functions` directory:
    ```bash    
    cd functions    
    ```    
2.  Create a file named `gofannon_manifest.json`.
3.  Open `functions/gofannon_manifest.json` and add the following basic structure. If you have Gofannon tools, you can add their configurations here.
    ```json    
    {    
      "tools": [    
        // {    
        //   "id": "my_custom_gofannon_tool",    
        //   "name": "My Custom Gofannon Tool",    
        //   "description": "A tool that does something cool.",    
        //   "module_path": "my_tools.custom_tool_module",    
        //   "class_name": "CustomTool"    
        // }    
      ]    
    }    
    ```    
4.  Save the file.

### Install Firebase CLI

The Firebase Command Line Interface (CLI) is used to manage and deploy your Firebase project.

1.  Install the Firebase CLI globally using npm:
    ```bash    
    npm install -g firebase-tools    
    ```    
2.  Verify installation:
    ```bash    
    firebase --version    
    ```    

### Log in to Firebase CLI

1.  Log in to Firebase using your Google account:
    ```bash    
    firebase login    
    ```    
    This will open a browser window for you to authenticate.

### Initialize Firebase in Your Project

If the cloned repository doesn't include a `.firebaserc` file or a `firebase.json` file tailored for general use, you'll need to initialize Firebase for your specific project.

1.  Navigate back to the project's root directory (`agentlabui`):
    ```bash    
    cd ..     
    ```    
    (If you are already in the root, skip this.)
2.  Run the Firebase initialization command:
    ```bash    
    firebase init    
    ```    
3.  You'll be asked "Which Firebase features do you want to set up for this directory?". Select the following using the spacebar, then press Enter:
    *   `Firestore: Configure security rules and indexes files for Firestore.`
    *   `Functions: Configure a Cloud Functions directory and optionally emulators.`
    *   `Hosting: Configure and deploy Firebase Hosting sites.`
4.  **Project Setup:**
    *   Choose "**Use an existing project**" and select the Firebase project you created earlier.
5.  **Firestore Setup:**
    - *Note: These files are already present in the project repo, use the default and do NOT overwrite the files.*
    *   "What file should be used for Firestore Rules?": Press Enter for the default (`firestore.rules`).
    *   "What file should be used for Firestore indexes?": Press Enter for the default (`firestore.indexes.json`).    
        *(You'll need to create `firestore.rules` with your desired security rules, or copy them from the Firebase console if you set them there).*
6.  **Functions Setup:**
    *   "What language would you like to use to write Cloud Functions?": Choose **Python**.
    *   "Do you want to use ESLint...": If it asks this for Python (it might not), you can say No. (ESLint is for JavaScript).
    *   "File functions/requirements.txt already exists. Overwrite?": **No**.
    *   "File functions/.gitignore already exists. Overwrite?": **No**.
    *   "Would you like to install dependencies now with pip?": **Yes**.
7.  **Hosting Setup:**
    *   "What do you want to use as your public directory?": Type `build`. (This is where the React app's production files will be.)
    *   "Configure as a single-page app (rewrite all urls to /index.html)?": **Yes**.
    *   "Set up automatic builds and deploys with GitHub?": **No** (for now, we'll cover GitHub Actions separately).
    *   "File build/index.html already exists. Overwrite?": This might appear if you've run `npm run build` before. If so, say **No** if you want to keep your current build, or Yes if you don't mind it being overwritten with a placeholder. It will be correctly built later.

This process creates `firebase.json` and `.firebaserc` files, configuring your local project to work with your Firebase project.
    
---    

## 4. Vertex AI Configuration (for Agent Deployment)

AgentLabUI allows you to deploy agents to Google Cloud's Vertex AI using the Agent Development Kit (ADK). This requires some Google Cloud setup.

1.  **Google Cloud Project:** Your Firebase project is also a Google Cloud Project. You can use this same project for Vertex AI.
2.  **Enable Vertex AI API:**
    *   Go to the [Google Cloud Console](https://console.cloud.google.com/).
    *   Select your project.
    *   In the navigation menu, go to "Vertex AI".
    *   If it's your first time, click "**Enable Vertex AI API**" (or similar prompts to enable the API).
3.  **IAM Permissions:** The Firebase Functions service account needs permissions to interact with Vertex AI and Cloud Storage.
    *   In the Google Cloud Console, go to "IAM & Admin" -> "IAM".
    *   Find the service account named `your-project-id@appspot.gserviceaccount.com`.
    *   Click the pencil icon (Edit principal) for this service account.
    *   Add the following roles:
        *   `Vertex AI User` (for deploying and managing Vertex AI resources)
        *   `Service Account User` (to allow the service account to act as itself, sometimes needed by ADK)
        *   `Storage Object Admin` (for the ADK staging bucket, which will be `gs://your-project-id-adk-staging`)
    *   Click "Save".
4.  **Staging Bucket:** The application will attempt to use a Cloud Storage bucket named `gs://<your-project-id>-adk-staging`. This bucket is typically created automatically on the first ADK deployment if it doesn't exist and the service account has `Storage Admin` or sufficient creation permissions on the project level. If not, you might need to create it manually via the Cloud Storage console.

---    

## 5. Running and Deploying the Application (Manually)

### Run the Frontend (React App)

1.  Ensure you are in the project's root directory (`agentlabui`).
2.  Start the React development server:
    ```bash    
    npm start    
    ```    
    (If you prefer Yarn: `yarn start`)
3.  This will open the application in your web browser, usually at `http://localhost:3000`.

### Deploy Firebase Components

To make your application and backend functions accessible online, you need to deploy them to Firebase.

1.  **Build the React App for Production:**    
    Before deploying hosting, create an optimized build of your React app:
    ```bash    
    npm run build    
    ```    
    This creates a `build` folder in your project root.

2.  **Deploy to Firebase:**    
    From the project root directory, deploy all configured Firebase features (Hosting, Functions, Firestore rules):
    ```bash    
    firebase deploy    
    ```    
    Or, to deploy specific parts:
    *   Deploy only functions: `firebase deploy --only functions`
    *   Deploy only hosting: `firebase deploy --only hosting`
    *   Deploy only Firestore rules: `firebase deploy --only firestore:rules` (Make sure `firestore.rules` exists and is correctly configured).

    After deployment, the Firebase CLI will output the URL for your hosted web application.

---  

## 6. Automated Deployments with GitHub Actions

This project includes GitHub Actions workflows to automate building and deploying the frontend to Firebase Hosting.

### Overview

Two workflows are defined in the `.github/workflows/` directory:
*   `firebase-hosting-merge.yml`: Deploys to a `live` Firebase Hosting channel on pushes to the `main` branch.
*   `firebase-hosting-pull-request.yml`: Deploys to a temporary preview Firebase Hosting channel for pull requests made within the main repository.

These workflows are conditional and rely on GitHub Secrets being configured in your repository.

### Required GitHub Secrets

To enable these workflows, you (or the repository owner) need to configure the following secrets in your GitHub repository settings:

1.  **`FIREBASE_CONFIG_JSON`**
    *   **Purpose:** Provides the client-side Firebase configuration to the application during the build process. The workflow uses this to create the `src/firebaseConfig.json` file and to extract the Firebase `projectId` for deployment.
    *   **Content:** The full JSON object you copied when [Registering your Web App in Firebase](#register-a-web-app--get-config). It looks like:
        ```json  
        {  
          "apiKey": "AIza...",  
          "authDomain": "your-project.firebaseapp.com",  
          "projectId": "your-project-id",  
          "storageBucket": "your-project.appspot.com",  
          "messagingSenderId": "123...",  
          "appId": "1:123...:web:abc...",  
          "measurementId": "G-..."  
        }  
        ```  
    *   **When to set:** If you want the GitHub Actions to build the application with Firebase integration and/or deploy it. If this secret is not set, the workflow jobs will be skipped.

2.  **`FIREBASE_SERVICE_ACCOUNT_AGENT_WEB_UI`**
    *   **Purpose:** A Firebase service account key (in JSON format) that grants GitHub Actions permission to deploy resources to your Firebase project (specifically Firebase Hosting).
    *   **Content:** The JSON key file for a Firebase service account.
        1.  Go to your Firebase Project > Project Settings > Service accounts.
        2.  Select "Node.js" (or "Java"/"Python") and click "Generate new private key".
        3.  Confirm and download the JSON file.
        4.  Copy the entire content of this JSON file as the value for the secret.  
            Ensure this service account has the "Firebase Hosting Admin" role in your Google Cloud project's IAM settings.
    *   **When to set:** If you want the GitHub Actions to automatically deploy your application to Firebase Hosting. If this secret is not set (even if `FIREBASE_CONFIG_JSON` is), the build may complete, but the deployment step will be skipped.

### How to Set GitHub Secrets

1.  Navigate to your GitHub repository.
2.  Go to `Settings` > `Secrets and variables` > `Actions`.
3.  Click `New repository secret`.
4.  Enter the secret name (e.g., `FIREBASE_CONFIG_JSON`) and paste its value.
5.  Click `Add secret`. Repeat for all necessary secrets.

### Workflow Details

*   **`firebase-hosting-merge.yml` (Deploy to Live on `main` merge/push):**
    *   **Trigger:** Runs on every push to the `main` branch.
    *   **Conditional Execution:**
        *   The entire job runs only if `secrets.FIREBASE_CONFIG_JSON` exists.
        *   The deployment step runs only if `secrets.FIREBASE_SERVICE_ACCOUNT_AGENT_WEB_UI` also exists and a valid `projectId` is extracted from `FIREBASE_CONFIG_JSON`.
    *   **Actions:**
        1.  Checks out the code.
        2.  Creates `src/firebaseConfig.json` using the content of `secrets.FIREBASE_CONFIG_JSON`.
        3.  Extracts `projectId` from `secrets.FIREBASE_CONFIG_JSON`.
        4.  Installs dependencies (`npm install`) and builds the React app (`npm run build`).
        5.  Deploys the contents of the `build/` directory to the `live` channel of your Firebase Hosting site, using the extracted `projectId`.

*   **`firebase-hosting-pull-request.yml` (Deploy Preview on PR):**
    *   **Trigger:** Runs on every pull request opened or updated against branches in the main repository.
    *   **Security for Forks:** This workflow includes an `if` condition: `${{ github.event.pull_request.head.repo.full_name == github.repository }}`. This ensures the job only runs if the pull request originates from a branch within the same repository, not from an external fork. PRs from forks will not trigger deployments to the upstream project's preview channels using upstream secrets.
    *   **Conditional Execution:**
        *   The entire job runs only if it's an internal PR AND `secrets.FIREBASE_CONFIG_JSON` exists.
        *   The deployment step runs only if `secrets.FIREBASE_SERVICE_ACCOUNT_AGENT_WEB_UI` also exists and a valid `projectId` is extracted.
    *   **Actions:**
        1.  Checks out the code.
        2.  Creates `src/firebaseConfig.json` using `secrets.FIREBASE_CONFIG_JSON`.
        3.  Extracts `projectId` from `secrets.FIREBASE_CONFIG_JSON`.
        4.  Installs dependencies and builds the React app.
        5.  Deploys the `build/` directory to a unique preview channel on Firebase Hosting (e.g., `pr-<pr-number>-<sha>`), using the extracted `projectId`. The Firebase action automatically generates a comment on the PR with a link to the preview site.

### Notes for Contributors and Forked Repositories

*   **Upstream Repository:** The main `AI-Citizen/agentlabui` repository might not have the `FIREBASE_SERVICE_ACCOUNT_AGENT_WEB_UI` secret configured. This means that, by design, pushes to `main` or PRs within the upstream repo might build but not automatically deploy to a live or preview Firebase instance associated with the upstream project.
*   **Forked Repositories:** If you fork this project and want to set up automated deployments to *your own* Firebase project:
    1.  Create your own Firebase project (or use an existing one).
    2.  In *your fork's* GitHub repository settings, add the `FIREBASE_CONFIG_JSON` and `FIREBASE_SERVICE_ACCOUNT_AGENT_WEB_UI` secrets, ensuring the values correspond to *your* Firebase project and service account.
    3.  The workflows (copied to your fork) will then use these secrets to deploy to *your* Firebase project when you push to `main` in your fork or create PRs within your fork.
    4.  The `projectId` used for deployment will be dynamically taken from the `FIREBASE_CONFIG_JSON` secret you provide in your fork.

---    

## 7. First Use

1.  **Open the application:**
    *   Locally: `http://localhost:3000`
    *   After deployment: Use the Firebase Hosting URL provided by `firebase deploy` or the GitHub Actions workflow.
2.  **Log in:** Click the "Login with Google" button.
3.  You should be redirected to the dashboard, where you can start creating agents.

### Creating a Basic Agent

1. **Access Create Agent Page:**
   - Click "Create New Agent" button on the dashboard, or
   - Use the "+" button in the navigation bar

2. **Fill in Basic Information:**
   - Choose a platform (eg. `Google Vertex AI`)
   - **Agent Name:** Give your agent a descriptive name (required)
   - **Description:** (Optional) Add details about the agent's purpose
   - **Agent Type:** Choose from the dropdown:
     - `Agent`: Standard single agent
     - `SequentialAgent`: Executes child agents in sequence
     - `ParallelAgent`: Runs child agents concurrently
     - `LoopAgent`: Repeats execution up to a specified number of times

3. **Configure Agent Settings:**
   - **Model:** Select a Gemini model (e.g., `gemini-1.5-flash-001`)
   - **Instruction:** Define the agent's behavior using a system prompt
   - **Enable Built-in Code Execution:** Toggle if you want the agent to execute code
     (Requires a Gemini 2 model compatible with code execution)

4. **Select Tools:**
   Your agent can use two types of tools:
   
   a. **ADK Built-in Tools:**
   - Google Search (ADK Built-in)
   - Vertex AI Search (ADK Built-in)
   
   b. **Gofannon Tools:**
   - Click "Refresh" to load available Gofannon tools
   - Select tools as needed for your agent's functionality
   - Configure tool settings if required

5. **Create the Agent:**
   - Click "Create Agent" button
   - You'll be redirected to the agent details page

### Example Agent Configurations

1. **Simple Q&A Agent:**
   ```
   Name: Basic Assistant
   Type: Agent
   Model: gemini-1.5-flash-001
   Instruction: You are a helpful assistant. Answer questions accurately and concisely.
   Tools: None
   ```

2. **Research Agent:**
   ```
   Name: Research Helper
   Type: Agent
   Model: gemini-1.5-flash-001
   Instruction: You are a research assistant. Use Google Search to find accurate information and summarize findings.
   Tools: Google Search (ADK Built-in)
   Enable Code Execution: No
   ```

### After Creation

Once your agent is created, you can:
- Deploy it to Vertex AI
- Test it in the chat interface
- Edit its configuration
- View its deployment status
- Delete it when no longer needed
 

## 8. User Roles and Permissions System

AgentLabUI now includes a user roles and permissions system to control access to various features and the application itself.

### Overview

*   **Users Collection:** User profiles and permissions are stored in a Firestore collection named `users`. Each document in this collection corresponds to a user and is keyed by their Firebase Authentication UID.
*   **Permissions Field:** Each user document can have a `permissions` map field. This map contains boolean keys that define what a user is allowed to do.
    *   `isAdmin`: (boolean) If true, the user can access the Admin Panel and manage other users' permissions.
    *   `isAuthorized`: (boolean) If true, the user is authorized to access the main application features (dashboard, agents, etc.). If false or if the `permissions` field is missing, the user will be redirected to an "Unauthorized" page after logging in.
    *   `canCreateAgent`: (boolean) If true, the user can create new agent configurations.
    *   `canRunAgent`: (boolean) If true, the user can run deployed agents.
*   **New User Workflow:**
    1.  When a new user logs in for the first time, a basic profile is created for them in the `users` collection *without* the `permissions` field.
    2.  These users will appear in the "Admin Panel" under "Users Awaiting Permission Setup".
    3.  An administrator must then set their permissions.

### Initial Admin Setup (Crucial First Step)

To use the admin features and authorize other users, you must first manually designate an initial administrator.

1.  **Log In:** Log in to the AgentLabUI application with the Google account you intend to be the first administrator. This action will create their user document in the `users` collection in Firestore if it doesn't already exist.
2.  **Access Firestore:** Go to your Firebase Console -> Firestore Database.
3.  **Locate User Document:** Navigate to the `users` collection. Find the document whose ID matches the Firebase UID of the admin user you just logged in with.
4.  **Add Permissions Field:**
    *   Click "Add field" to this user's document.
    *   **Field name:** `permissions`
    *   **Field type:** `map`
    *   Inside this `permissions` map, add the following key-value pairs (all boolean):
        *   `isAdmin` : `true`
        *   `isAuthorized` : `true`
        *   `canCreateAgent` : `true` (or `false` as desired)
        *   `canRunAgent` : `true` (or `false` as desired)
    *   You can also add a field `permissionsLastUpdatedAt` (type: timestamp) if you wish, though the system will add/update this when permissions are changed via the admin panel.

    Example structure for the admin's `permissions` field:
    ```  
    permissions (map)  
        isAdmin (boolean)      : true  
        isAuthorized (boolean) : true  
        canCreateAgent (boolean): true  
        canRunAgent (boolean)   : true  
    ```  
5.  **Verify:** Log out and log back in as the admin user. You should now see an "Admin" link in the navigation bar.

### Admin Panel

*   **Access:** Users with `permissions.isAdmin === true` will see an "Admin" link in the navigation bar, leading to `/admin`.
*   **Functionality:**
    *   **Users Awaiting Permission Setup:** The Admin Panel lists all users whose `users/{uid}` document in Firestore does *not* yet have a `permissions` field.
    *   **Set Permissions:**
        *   Admins can click on a user from this list.
        *   A dialog will appear allowing the admin to toggle checkboxes for `isAdmin`, `isAuthorized`, `canCreateAgent`, and `canRunAgent`.
        *   Saving these permissions will update the user's document in Firestore.
        *   Once permissions are set, the user will no longer appear in the "awaiting review" list.

### User Experience

*   **Authorized Users:** If a user has `permissions.isAuthorized === true`, they can access the application's protected routes (Dashboard, Create Agent, etc.) based on their other specific permissions (e.g., `canCreateAgent`).
*   **Unauthorized Users:** If a user logs in and their `permissions` field is missing, or `permissions.isAuthorized === false`, they will be redirected to an `/unauthorized` page. They must be explicitly authorized by an admin.

### Firestore Security Rules

The Firestore security rules (`firestore.rules`) have been updated to support this system:
*   Users can create their own profile on first login (via `ensureUserProfile`) but cannot set their own permissions.
*   Users can update specific, non-sensitive fields of their own profile (e.g., `lastLoginAt`, `displayName`).
*   Only users designated as admins (via `permissions.isAdmin === true` in their *own* user document) can:
    *   Read all user documents (for the admin panel).
    *   Update the `permissions` field of *other* user documents.
*   Permissions like `canCreateAgent` and `canRunAgent` are checked by the rules before allowing agent creation or run operations.

---

## 9. Troubleshooting (Common Issues)

*   **Permission Errors (Firebase/GCP):**
    *   Ensure your Firebase project is on the Blaze plan for Functions.
    *   Double-check IAM permissions for the `your-project-id@appspot.gserviceaccount.com` service account in the GCP console, especially for Vertex AI and Cloud Storage access. For GitHub Actions, ensure the service account used in `FIREBASE_SERVICE_ACCOUNT_AGENT_WEB_UI` has "Firebase Hosting Admin".
    *   Verify Firestore security rules.
*   **`firebaseConfig.json` not found (Local Development):** Ensure you've created `src/firebaseConfig.json` correctly with your project's credentials. For GitHub Actions, ensure the `FIREBASE_CONFIG_JSON` secret is set.
*   **Function deployment errors:**
    *   Check the Firebase console Functions logs for detailed error messages.
    *   Ensure Python and pip are correctly installed and that `functions/requirements.txt` lists all necessary Python dependencies.
    *   The `functions/gofannon_manifest.json` file must exist.
*   **ADK deployment issues (`deploy_agent_to_vertex` function):**
    *   These can be complex. Check the Cloud Function logs in the Firebase console or Google Cloud Logging for detailed ADK or Vertex AI errors.
    *   Ensure the Vertex AI API is enabled and IAM permissions are correct.
    *   The ADK staging bucket (`gs://your-project-id-adk-staging`) must be accessible.
*   **CORS errors (less likely with Callable Functions):** Firebase Callable Functions handle CORS automatically. If you encounter them, it might be a misconfiguration or an issue with how requests are made.
*   **GitHub Actions Failures:**
    *   Check the "Actions" tab in your GitHub repository for logs.
    *   Verify that secrets are correctly named and their content is accurate (e.g., valid JSON).
    *   Ensure `jq` (used for extracting `projectId`) is correctly parsing the `FIREBASE_CONFIG_JSON`.

---    

That's it! You should now have AgentLabUI up and running. Happy agent building!  
