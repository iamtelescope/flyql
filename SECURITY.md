# Security Policy

## Supported Versions

FlyQL is pre-1.0. Security fixes are applied to the **latest release only** across all language implementations (Go, Python, JavaScript).

| Package              | Supported version |
| -------------------- | ----------------- |
| `flyql` (Python)     | latest            |
| `flyql` (Go module)  | latest            |
| `flyql` (JS)         | latest            |

Older releases do not receive backports.

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Use [GitHub's private vulnerability reporting](https://github.com/iamtelescope/flyql/security/advisories/new) to submit your report. This ensures the details stay confidential until a fix is available.

### What to include

- Description of the vulnerability
- Steps to reproduce (a minimal FlyQL expression and configuration that triggers the issue)
- Which language implementation is affected (Go, Python, JavaScript, or all)
- Impact assessment if you have one

### What to expect

- **Acknowledgement** within 7 days
- We will work with you to understand and validate the issue
- A fix will be developed privately and released as a patch
- You will be credited in the release notes unless you prefer otherwise

### Scope

The following are considered in-scope:

- SQL injection bypasses — any FlyQL expression that produces unsafe SQL output
- AST manipulation that circumvents validation or filtering rules
- Denial of service via crafted expressions (e.g., catastrophic backtracking in regex handling)
- Vulnerabilities in any of the language implementations (Go, Python, JavaScript)

Out of scope:

- Bugs in third-party dependencies (report these upstream, but let us know if they affect FlyQL)
- Issues in the documentation site or playground that do not expose user data
