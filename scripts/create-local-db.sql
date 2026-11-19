-- Creates the application role + database on a native (non-Docker) PostgreSQL.
-- Run as the postgres superuser, passing the password from your .env:
--   psql -h localhost -U postgres -v awt_password="<password>" -f scripts/create-local-db.sql
-- (npm run db:setup-native does this for you using DATABASE_URL from .env.)

\set ON_ERROR_STOP on

SELECT format('CREATE ROLE awt LOGIN PASSWORD %L CREATEDB', :'awt_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'awt') \gexec

-- Keep the password in sync if the role already existed.
SELECT format('ALTER ROLE awt WITH LOGIN PASSWORD %L CREATEDB', :'awt_password') \gexec

SELECT 'CREATE DATABASE awt OWNER awt'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'awt') \gexec

\echo 'Role "awt" and database "awt" are ready.'
