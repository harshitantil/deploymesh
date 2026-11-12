# CloudForge

CloudForge is a cloud-native deployment automation platform that streamlines application delivery using Infrastructure as Code, containers, CI/CD, and observability. It is designed to automate the build, test, deploy, rollback, and monitoring lifecycle for modern applications across cloud environments.

## Overview

CloudForge helps teams ship software faster and more reliably by reducing manual deployment steps and standardizing infrastructure provisioning. The platform brings together Terraform, Docker, Kubernetes, Ansible, GitHub Actions, AWS, Prometheus, and Grafana to create a production-oriented DevOps workflow.

## Key Features

- Infrastructure provisioning using Terraform
- Containerized application packaging with Docker
- Orchestration and deployment with Kubernetes
- Configuration management with Ansible
- Automated CI/CD pipelines using GitHub Actions
- Rollback-ready deployment workflow
- Monitoring and alerting with Prometheus and Grafana
- Secure access control using AWS IAM and Kubernetes RBAC

## Tech Stack

- **Frontend:** JavaScript, HTML, CSS
- **Backend/Automation:** Node.js, Express.js
- **Cloud:** AWS
- **IaC:** Terraform
- **Containerization:** Docker
- **Orchestration:** Kubernetes
- **Configuration Management:** Ansible
- **CI/CD:** GitHub Actions
- **Observability:** Prometheus, Grafana

## What It Does

CloudForge supports an end-to-end deployment pipeline that can:

1. Provision infrastructure in a repeatable way
2. Build and package applications into containers
3. Deploy workloads to Kubernetes
4. Apply configuration automatically
5. Continuously integrate and validate changes
6. Monitor system health and performance
7. Support safer production rollouts and rollback

## Why I Built It

Modern deployments often become fragmented across different tools and manual steps. CloudForge was built to demonstrate how a single automation platform can unify infrastructure provisioning, application delivery, monitoring, and access control into one consistent workflow.

## Highlights

- Reproducible deployments with Infrastructure as Code
- Reduced configuration drift across environments
- Better deployment consistency through automation
- Production visibility through dashboards and alerts
- Secure operational setup with least-privilege access controls

## Repository Structure

```bash
cloudforge/
├── frontend/
├── backend/
├── terraform/
├── ansible/
├── k8s/
├── .github/workflows/
└── README.md
