# Deploying the Gofannon MCP Server to Google Cloud Run

This guide explains how to deploy the `gofannon-mcp-grants` server to Google Cloud Run. This server uses the FastMCP framework to expose grant-matching tools from the `gofannon` library as a web service.

## Overview

The deployment process leverages Google Cloud Build to automatically build a container image from the provided `Dockerfile` and then deploy it to Cloud Run. The key files involved are:

-   **`Dockerfile`**: Defines the container environment, installs dependencies using `uv`, and specifies the command to run the server.
-   **`server.py`**: The main application file that initializes the FastMCP server and registers the `gofannon` tools.
-   **`pyproject.toml`**: Defines the project's Python dependencies.
-   **`launch.sh`**: A simple shell script that contains the `gcloud` command to build and deploy the service.

## Prerequisites

Before you begin, ensure you have the following:

1.  **Google Cloud SDK**: The `gcloud` command-line tool must be installed and authenticated. You can find installation instructions [here](https://cloud.google.com/sdk/docs/install).
2.  **Google Cloud Project**: A project with billing enabled.
3.  **Enabled APIs**: The Cloud Run and Cloud Build APIs must be enabled for your project. You can enable them with the following commands:
    ``` bash
    gcloud services enable run.googleapis.com
    gcloud services enable cloudbuild.googleapis.com
    ```
4.  **Simpler Grants API Key**: You need an API key for the Simpler Grants service, which is used by the underlying `gofannon` tools.

## Step 1: Set Up Your Environment

1.  **Get the code**: Clone the repository or download the project files to your local machine.

2.  **Set your Google Cloud Project**: Configure `gcloud` to use your target project.
    ``` bash
    gcloud config set project YOUR_PROJECT_ID
    ```

3.  **Set the Region**: Define an environment variable for the Google Cloud region where you want to deploy the service.
    ``` bash
    export REGION="us-central1" # Or any other supported Cloud Run region
    ```

## Step 2: Configure the Deployment Script

The `launch.sh` script handles the deployment. You must edit it to include your Simpler Grants API key.

1.  Open the `launch.sh` file.
2.  Find the line with `--set-env-vars`.
3.  Replace the placeholder `<YOUR_SIMPLER_GRANTS_API_KEY>` with your actual API key.

**Original `launch.sh`:**
``` bash
gcloud run deploy gofannon-mcp-grants \
  --source . \
  --allow-unauthenticated \
  --region=$REGION \
  --set-env-vars "SIMPLER_GRANTS_API_KEY=<YOUR_SIMPLER_GRANTS_API_KEY>"
```

**Example after editing:**
``` bash
gcloud run deploy gofannon-mcp-grants \
  --source . \
  --allow-unauthenticated \
  --region=$REGION \
  --set-env-vars "SIMPLER_GRANTS_API_KEY=abcdef1234567890"
```

## Step 3: Deploy the Server

Once the configuration is complete, you can deploy the application by running the launch script.

1.  Make sure the script is executable:
    ``` bash
    chmod +x launch.sh
    ```

2.  Run the script:
    ``` bash
    ./launch.sh
    ```

This command will:
-   **Trigger Cloud Build**: It uploads your source code (the current directory) to Google Cloud.
-   **Build the Container**: Cloud Build uses the `Dockerfile` to build a container image. It runs `uv sync` to install all Python dependencies specified in `pyproject.toml` and `uv.lock`.
-   **Push to Artifact Registry**: The newly built image is pushed to a Google-managed Artifact Registry repository.
-   **Deploy to Cloud Run**: The image is deployed as a service named `gofannon-mcp-grants`. The service is configured to be publicly accessible (`--allow-unauthenticated`) and will have the `SIMPLER_GRANTS_API_KEY` environment variable available to it.

The process will take a few minutes. Upon completion, the `gcloud` tool will output the **Service URL**.

## Step 4: Verify the Deployment

After a successful deployment, you will receive a URL for your service. You can verify that the server is running by accessing its root URL in a web browser or with a tool like `curl`.

``` bash
# Replace YOUR_SERVICE_URL with the URL from the deployment output
curl YOUR_SERVICE_URL
```

You should see a JSON response from the FastMCP server, confirming that it is running and listing the available tools.

``` json
{
  "name": "MCP Server on Cloud Run",
  "tools": {
    "gofannon.simpler_grants_gov.query_opportunities": { ... },
    "gofannon.grant_query.grant_query": { ... }
  },
  "mcp_version": "1.0"
}
```

Your Gofannon MCP server is now deployed and ready to be used by any MCP-compatible client.