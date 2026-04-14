#!/bin/bash
set -e

echo "🚀 Starting email analysis worker..."
echo "   Database: ${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}"
echo "   LLM Model: ${LLM_MODEL:-claude-sonnet-4-6}"
echo ""

python analyze_emails.py
