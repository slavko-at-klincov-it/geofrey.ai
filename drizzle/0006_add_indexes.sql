CREATE INDEX IF NOT EXISTS idx_conversations_chat_id ON conversations(chat_id);
CREATE INDEX IF NOT EXISTS idx_cron_jobs_schedule ON cron_jobs(enabled, next_run_at);
CREATE INDEX IF NOT EXISTS idx_usage_log_timestamp ON usage_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_usage_log_chat_id ON usage_log(chat_id);
CREATE INDEX IF NOT EXISTS idx_memory_chunks_source ON memory_chunks(source);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_agent_id ON agent_sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_chat_id ON agent_sessions(chat_id);
