CREATE TABLE IF NOT EXISTS word_batches(workspace TEXT,id TEXT,kind TEXT,data TEXT,PRIMARY KEY(workspace,id));
CREATE TABLE IF NOT EXISTS word_terms(workspace TEXT,word TEXT,kind TEXT,batch TEXT,origin TEXT,PRIMARY KEY(workspace,word,kind,batch,origin));
CREATE INDEX IF NOT EXISTS word_terms_selection ON word_terms(workspace,kind,origin,word);
CREATE TABLE IF NOT EXISTS word_exports(workspace TEXT,name TEXT,revision INTEGER,data TEXT,PRIMARY KEY(workspace,name,revision));
CREATE TABLE IF NOT EXISTS export_operations(id TEXT PRIMARY KEY,name TEXT,revision INTEGER,args TEXT,data TEXT,state TEXT,UNIQUE(name,revision));
