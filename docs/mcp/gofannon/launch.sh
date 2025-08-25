gcloud run deploy gofannon-mcp-grants \
  --source . \
  --allow-unauthenticated \
  --region=$REGION \
  --set-env-vars "SIMPLER_GRANTS_API_KEY=<YOUR_SIMPLER_GRANTS_API_KEY>"
