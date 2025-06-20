# Upstream Repository Synchronization Workflow

This workflow syncs your repository with upstream changes from [The-AI-Alliance/agent-lab-ui](https://github.com/The-AI-Alliance/agent-lab-ui), preserving local changes during conflicts. It creates a new branch with the merged changes for review before merging into your main branch.

## Features
- Syncs with specific upstream tags
- Resolves merge conflicts in favor of your local changes
- Creates a new branch for each sync
- Preserves existing workflows and configuration
- Lists available upstream tags for reference

## Prerequisites

### 1. Create Personal Access Token (PAT)
You need a PAT with proper permissions:
1. Go to [GitHub Settings > Developer Settings > Personal Access Tokens](https://github.com/settings/tokens)
2. Click "Generate new token"
3. Name: `Agent Lab Sync Token`
4. Expiration: Recommended 90 days
5. Select permissions:
    - ✅ `repo` (Full control of private repositories)
    - ✅ `workflow` (Update GitHub Action workflows)
6. Click "Generate token"
7. **Copy the token value** (you won't see it again)

### 2. Add PAT to Repository Secrets
1. Go to your repository Settings > Secrets and variables > Actions
2. Click "New repository secret"
3. Name: `PAT`
4. Value: Paste the token you copied
5. Click "Add secret"

### 3. Enable Workflow Permissions
1. Go to repository Settings > Actions > General
2. Under "Workflow permissions":
    - Select "Read and write permissions"
    - Check "Allow GitHub Actions to create and approve pull requests"
3. Click "Save"

## Using the Workflow

### Triggering the Sync
1. Go to your repository's Actions tab
2. Select "Sync Upstream with Conflict Resolution"
3. Click "Run workflow"
4. Provide inputs:
    - `upstream_tag`: The upstream tag to sync with (e.g., `v0.0.2-pre-alpha`)
    - `new_branch`: Name for the new branch (e.g., `sync/upstream-v0.0.2`)
5. Click "Run workflow"

### Input Parameters
| Parameter | Description | Example |  
|-----------|-------------|---------|  
| `upstream_tag` | Tag from upstream repository | `v0.0.2-pre-alpha` |  
| `new_branch` | New branch name for the sync | `sync/upstream-v0.0.2` |  

### Workflow Process
The workflow will:
1. List available upstream tags
2. Verify the specified tag exists
3. Create a new branch
4. Merge upstream changes
5. Resolve conflicts in favor of local changes
6. Commit the merge result
7. Push to the new branch

### After Completion
1. Review the new branch:
    - Check for unexpected changes
    - Verify conflict resolution
2. Create a pull request to merge into your main branch
3. Test changes before merging

## Viewing Available Tags
The workflow lists available upstream tags in the "List available upstream tags" step. View these in the workflow logs:

```text  
Available tags in upstream:  
v0.0.1  
v0.0.2-pre-alpha  
v0.0.2  
v1.0.0-rc1  
...  
```

## Troubleshooting
- **Tag not found**: Verify tag name matches exactly (use copy from available tags list)
- **Permission errors**: Ensure PAT has proper permissions and is added to secrets
- **Merge conflicts**: Review conflict resolution in the new branch
- **Workflow not appearing**: Check it's in `.github/workflows/sync-upstream.yml`

## Security Notes
- PATs should have minimum required permissions
- Rotate PATs periodically (every 90 days recommended)
- Never hardcode tokens in workflow files
- Review upstream changes before merging into main branch  