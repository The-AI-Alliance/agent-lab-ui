# Document: `gofannonToolManifest/latest`

This document acts as a cache for the Gofannon tool manifest. The system is designed to use a local `gofannon_manifest.json` file as the source of truth, writing its contents to this single document in Firestore each time the `get_gofannon_tool_manifest` cloud function is called.

## Fields

| Field                       | Type          | Description                                                                                               | Set By                                   | Read By                                                   |    
| --------------------------- | ------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------- |    
| `tools`                     | Array of Maps | The complete list of tool definition objects as specified in the `gofannon_manifest.json` file.           | `_get_gofannon_tool_manifest_logic`      | `fetchGofannonTools` (for `ToolSelector` in UI)           |    
| `last_updated_firestore`    | Timestamp     | A server-side timestamp indicating when this document was last written.                                   | `_get_gofannon_tool_manifest_logic`      | _(Not read by backend or client)_                         |    
| `source`                    | String        | A hardcoded string (`local_project_file`) indicating the origin of this data.                             | `_get_gofannon_tool_manifest_logic`      | _(Not read by backend or client)_                         |    
| `...`                       | Any           | Any other top-level keys from the root object of `gofannon_manifest.json` will also be stored here.       | `_get_gofannon_tool_manifest_logic`      | `fetchGofannonTools`                                      |    

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

*   **Indirect Reading Pattern:** The frontend (`ToolSelector`) does not read this Firestore document directly. Instead, it calls the `get_gofannon_tool_manifest` Cloud Function (via `agentService.fetchGofannonTools`). The backend function reads the local `gofannon_manifest.json` file from its own deployed package, writes its contents to this Firestore document (as a cache), and then returns the data to the client. The Firestore document itself is never read by any part of the system after being written.
*   **Update Mechanism:** The manifest can only be updated by redeploying the Cloud Functions with a new version of the `gofannon_manifest.json` file.  