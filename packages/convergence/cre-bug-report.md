**Bug: `cre workflow simulate` fails with `encryptOutput: true` after upgrading to CRE CLI v1.3.0**

```
✗ Workflow execution failed:
cannot decode message capabilities.networking.confidentialhttp.v1alpha.ConfidentialHTTPRequest from JSON: key "encryptOutput" is unknown
```

This worked fine in CLI v1.2.0. The SDK (`@chainlink/cre-sdk@1.1.4`) defines `encryptOutput` as field 9 in `client_pb.d.ts` — looks like the CLI v1.3.0 protobuf schema is missing the field.

We're using `encryptOutput: true` on `ConfidentialHTTPClient.sendRequest()` to encrypt entropy and Gemini API responses inside the enclave. It's a key part of our CRE privacy model for the hackathon submission (Deal or NOT).

Is this a known regression, or is there a workaround? Deadline is tonight.
