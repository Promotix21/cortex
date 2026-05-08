# Security Policy

## Supported Versions

We currently support the following versions of Cortex with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 2.7.x   | :white_check_mark: |
| < 2.7.0 | :x:                |

## Reporting a Vulnerability

We take the security of Cortex seriously. If you believe you have found a security vulnerability, please do not open a public issue. Instead, please report it to us privately.

**Email:** rajesh_kumar@hiraya.digital

Please include the following in your report:
- Type of issue (e.g., credential leak, RCE, etc.)
- Steps to reproduce
- Potential impact

We will acknowledge receipt of your report within 48 hours and provide a timeline for a fix if the vulnerability is confirmed.

## Local-First Security
Cortex is designed to be **local-first**.
- Your API keys are stored in an encrypted local vault.
- No telemetry or code data is ever sent to our servers.
- The sidecar runs on a local-only loopback interface.
