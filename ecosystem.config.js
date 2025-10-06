module.exports = {
  apps: [
    {
      name: 'codex-api-v2',
      script: './dist/server.js',
      instances: 'max', // Use all available CPU cores
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '1G',
      node_args: '--max-old-space-size=2048',
      env: {
        NODE_ENV: 'development',
        PORT: 4000,
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 4000,
        GRAPHQL_PLAYGROUND: true,
        GRAPHQL_INTROSPECTION: true,
        LOG_LEVEL: 'debug',
      },
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 4000,
        GRAPHQL_PLAYGROUND: true,
        GRAPHQL_INTROSPECTION: true,
        LOG_LEVEL: 'info',
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 4000,
        GRAPHQL_PLAYGROUND: false,
        GRAPHQL_INTROSPECTION: false,
        LOG_LEVEL: 'warn',
      },
      // Logging
      error_file: './logs/pm2/err.log',
      out_file: './logs/pm2/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      // Graceful shutdown
      kill_timeout: 5000,
      listen_timeout: 10000,
      // Auto-restart configuration
      min_uptime: '10s',
      max_restarts: 10,
      autorestart: true,
      restart_delay: 4000,
      // Advanced features
      vizion: true,
      post_update: ['npm install', 'npm run build'],
    },
    {
      name: 'codex-api-v2-dev',
      script: './src/server.ts',
      interpreter: 'node',
      interpreter_args: '-r ts-node/register',
      instances: 1,
      exec_mode: 'fork',
      watch: ['src'],
      ignore_watch: ['node_modules', 'logs', 'dist', '*.log'],
      watch_delay: 1000,
      env: {
        NODE_ENV: 'development',
        PORT: 4000,
        GRAPHQL_PLAYGROUND: true,
        GRAPHQL_INTROSPECTION: true,
        LOG_LEVEL: 'debug',
      },
      error_file: './logs/pm2/dev-err.log',
      out_file: './logs/pm2/dev-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      autorestart: true,
    },
  ],
};
