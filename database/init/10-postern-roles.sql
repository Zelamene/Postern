\getenv migrator_role POSTERN_MIGRATOR_ROLE
\getenv migrator_password POSTERN_MIGRATOR_PASSWORD
\getenv app_role POSTERN_APP_ROLE
\getenv app_password POSTERN_APP_PASSWORD

SELECT format(
    'CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT',
    :'migrator_role'
)
WHERE NOT EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = :'migrator_role'
)
\gexec

SELECT format(
    'ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT',
    :'migrator_role',
    :'migrator_password'
)
\gexec

SELECT format(
    'CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT',
    :'app_role'
)
WHERE NOT EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = :'app_role'
)
\gexec

SELECT format(
    'ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT',
    :'app_role',
    :'app_password'
)
\gexec

SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'migrator_role')
\gexec

SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'app_role')
\gexec

SELECT format(
    'REVOKE CONNECT, TEMPORARY ON DATABASE %I FROM PUBLIC',
    current_database()
)
\gexec

CREATE SCHEMA IF NOT EXISTS postern;

SELECT format('ALTER SCHEMA postern OWNER TO %I', :'migrator_role')
\gexec

REVOKE ALL ON SCHEMA public FROM PUBLIC;

SELECT format('REVOKE ALL ON SCHEMA public FROM %I', :'app_role')
\gexec

SELECT format('GRANT USAGE ON SCHEMA postern TO %I', :'app_role')
\gexec

SELECT format(
    'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA postern TO %I',
    :'app_role'
)
\gexec

SELECT format(
    'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA postern TO %I',
    :'app_role'
)
\gexec

SELECT format('GRANT %I TO %I', :'migrator_role', current_user) \gexec

SELECT format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA postern GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
    :'migrator_role',
    :'app_role'
)
\gexec

SELECT format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA postern GRANT USAGE, SELECT ON SEQUENCES TO %I',
    :'migrator_role',
    :'app_role'
)
\gexec

SELECT format('ALTER ROLE %I SET search_path = postern', :'app_role')
\gexec

SELECT format('ALTER ROLE %I SET search_path = postern', :'migrator_role')
\gexec
