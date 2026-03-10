import Database from 'better-sqlite3'
import path from 'node:path'
import { app } from 'electron'

export type Todo = {
  id: number
  text: string
  completed: boolean
}

type TodoRow = {
  id: number
  text: string
  completed: number
}

let db: Database.Database | null = null

function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return db
}

function mapTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    text: row.text,
    completed: row.completed === 1,
  }
}

export function initDatabase() {
  if (db) return

  const dbPath = path.join(app.getPath('userData'), 'app.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0
    )
  `)
}

export function listTodos(): Todo[] {
  const stmt = getDb().prepare(
    'SELECT id, text, completed FROM todos ORDER BY id DESC',
  )
  const rows = stmt.all() as TodoRow[]
  return rows.map(mapTodo)
}

export function createTodo(text: string): Todo {
  const insertStmt = getDb().prepare(
    'INSERT INTO todos (text, completed) VALUES (?, 0)',
  )
  const result = insertStmt.run(text)

  const selectStmt = getDb().prepare(
    'SELECT id, text, completed FROM todos WHERE id = ?',
  )
  const row = selectStmt.get(result.lastInsertRowid) as TodoRow
  return mapTodo(row)
}

export function updateTodoCompleted(id: number, completed: boolean): Todo {
  const updateStmt = getDb().prepare(
    'UPDATE todos SET completed = ? WHERE id = ?',
  )
  updateStmt.run(completed ? 1 : 0, id)

  const selectStmt = getDb().prepare(
    'SELECT id, text, completed FROM todos WHERE id = ?',
  )
  const row = selectStmt.get(id) as TodoRow | undefined

  if (!row) {
    throw new Error(`Todo with id ${id} not found`)
  }

  return mapTodo(row)
}

export function removeTodo(id: number) {
  const stmt = getDb().prepare('DELETE FROM todos WHERE id = ?')
  stmt.run(id)
}
