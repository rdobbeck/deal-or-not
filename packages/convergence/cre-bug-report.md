**Update: `encryptOutput` placement resolved — user error, not a CLI regression**

Earlier I reported this error after upgrading to CRE CLI v1.3.0:

```
✗ Workflow execution failed:
cannot decode message capabilities.networking.confidentialhttp.v1alpha.ConfidentialHTTPRequest from JSON: key "encryptOutput" is unknown
```

Turns out we accidentally moved `encryptOutput` to the wrong nesting level when porting our workflows. Our prototype had it correct (inside `request`), but the convergence port put it at the outer `ConfidentialHTTPRequest` level.

```typescript
// WRONG — we had this
confHTTPClient.sendRequest(runtime, {
  request: { url, method: "GET" },
  encryptOutput: true,        // ← wrong level
  vaultDonSecrets: [],
})

// CORRECT — encryptOutput is field 9 on HTTPRequest
confHTTPClient.sendRequest(runtime, {
  request: { url, method: "GET", encryptOutput: true },
  vaultDonSecrets: [],
})
```

Working great on CRE CLI v1.3.0 + SDK v1.1.4. Sorry for the false alarm!
