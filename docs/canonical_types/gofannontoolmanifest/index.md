# Document: `gofannonToolManifest/latest`

This document acts as a cache for the Gofannon tool manifest. The system is designed to use a local `gofannon_manifest.json` file as the source of truth, writing its contents to this single document in Firestore each time the `get_gofannon_tool_manifest` function is called.

## Fields

| Field                       | Type          | Description                                                                                               | Set By                                   | Read By                 |  
| --------------------------- | ------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ----------------------- |  
| `tools`                     | Array of Maps | The complete list of tool definition objects as specified in the `gofannon_manifest.json` file.           | `_get_gofannon_tool_manifest_logic`      | _(Not read by backend)_ |  
| `last_updated_firestore`    | Timestamp     | A server-side timestamp indicating when this document was last written.                                   | `_get_gofannon_tool_manifest_logic`      | _(Not read by backend)_ |  
| `source`                    | String        | A hardcoded string (`local_project_file`) indicating the origin of this data.                             | `_get_gofannon_tool_manifest_logic`      | _(Not read by backend)_ |  
| `...`                       | Any           | Any other top-level keys from the root object of `gofannon_manifest.json` will also be stored here.       | `_get_gofannon_tool_manifest_logic`      | _(Not read by backend)_ |  

## Prototypical Example

```json  
{  
"source": "local_project_file",  
"last_updated_firestore": "2024-05-21T10:00:00Z",  
"tools": [  
{  
"id": "gofannon-order-lookup",  
"name": "Order Lookup",  
"description": "Looks up details for a given order ID.",  
"type": "gofannon",  
"module_path": "gofannon_tools.orders",  
"class_name": "OrderLookupTool",  
"parameters": [  
{  
"name": "order_id",  
"type": "string",  
"required": true  
}  
]  
}  
]  
}  
```

## Inconsistencies and Notes

*   **Write-Only Pattern:** The backend functions only write to this document; they never read from it. Its primary purpose seems to be for the client/UI to fetch the manifest from a reliable, authenticated source (the Cloud Function) rather than directly from GitHub, with Firestore acting as a cache.
*   The system always overwrites the `latest` document with the content of the local `gofannon_manifest.json` file included in the function's deployment package. This means updating the manifest requires redeploying the Cloud Functions.  