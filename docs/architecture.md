# Architecture

## Goal

Build a scalable Patient Management System using clean architecture principles.

## Request Flow

Browser
    ↓
API
    ↓
Service
    ↓
Repository
    ↓
Database

## Folder Responsibilities

api/
Receives HTTP requests and returns responses.

core/
Contains project configuration and application settings.

db/
Handles database connection and session management.

models/
Database tables.

schemas/
Request and response validation.

repositories/
Communicates with the database.

services/
Contains business logic.

auth/
Authentication and authorization.

templates/
HTML pages rendered by FastAPI.

static/
CSS, images, icons.