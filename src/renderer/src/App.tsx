import { FormEvent, useEffect, useState } from 'react'

type Todo = {
  id: number
  text: string
  description: string
  completed: boolean
}

function App(): React.JSX.Element {
  const [todos, setTodos] = useState<Todo[]>([])
  const [newTodoText, setNewTodoText] = useState('')
  const [newTodoDescription, setNewTodoDescription] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [isAddPage, setIsAddPage] = useState(false)
  const [detailTodo, setDetailTodo] = useState<Todo | null>(null)
  const [deepLinkUrl, setDeepLinkUrl] = useState<string | null>(null)

  useEffect(() => {
    const unsubscribe = window.todoAPI.onShowAddPage(() => {
      setIsAddPage(true)
      setDetailTodo(null)
    })

    void window.todoAPI.list().then(setTodos)

    return () => {
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    const unsubscribe = window.todoAPI.onCreated((todo) => {
      setTodos((prev) => [todo, ...prev])
    })

    return () => {
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    const unsubscribe = window.todoAPI.onShowDetail((todo) => {
      setDetailTodo(todo)
      setIsAddPage(false)
    })

    return () => {
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    const unsubscribe = window.todoAPI.onDeepLink((url) => {
      setDeepLinkUrl(url)
    })

    return () => {
      unsubscribe()
    }
  }, [])

  const createTodo = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    const trimmed = newTodoText.trim()
    if (!trimmed) return
    const description = newTodoDescription.trim()

    if (isAddPage) {
      await window.todoAPI.createFromWindow(trimmed, description)
      setNewTodoText('')
      setNewTodoDescription('')
      window.todoAPI.closeAddWindow()
      return
    }

    const todo = await window.todoAPI.create(trimmed, description)
    setTodos((prev) => [todo, ...prev])
    setNewTodoText('')
    setNewTodoDescription('')
  }

  const toggleTodo = async (todo: Todo): Promise<void> => {
    const updated = await window.todoAPI.toggle(todo.id, !todo.completed)
    setTodos((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
  }

  const removeTodo = async (id: number): Promise<void> => {
    await window.todoAPI.remove(id)
    setTodos((prev) => prev.filter((item) => item.id !== id))
  }

  const normalizedSearch = searchQuery.trim().toLowerCase()
  const filteredTodos = normalizedSearch
    ? todos.filter((todo) => todo.text.toLowerCase().includes(normalizedSearch))
    : todos

  if (isAddPage) {
    return (
      <main className="todo-shell">
        <h1>Add Todo</h1>
        <form className="todo-form" onSubmit={createTodo}>
          <input
            autoFocus
            value={newTodoText}
            onChange={(event) => setNewTodoText(event.target.value)}
            placeholder="Todo title"
          />
          <textarea
            value={newTodoDescription}
            onChange={(event) => setNewTodoDescription(event.target.value)}
            placeholder="Todo description"
            rows={4}
          />
          <div className="row">
            <button type="submit">Create</button>
            <button type="button" className="ghost" onClick={() => window.todoAPI.closeAddWindow()}>
              Cancel
            </button>
          </div>
        </form>
      </main>
    )
  }

  if (detailTodo) {
    return (
      <main className="todo-shell">
        <h1>Todo Details</h1>
        <div className="todo-detail">
          <h2 className={detailTodo.completed ? 'done' : ''}>{detailTodo.text}</h2>
          <p>{detailTodo.description || 'No description provided.'}</p>
        </div>
        <div className="row">
          <button type="button" className="ghost" onClick={() => window.todoAPI.closeDetailWindow()}>
            Close
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="todo-shell">
      <h1>Todos</h1>
      {deepLinkUrl ? (
        <div className="deep-link-banner">
          <span>Opened from deep link:</span>
          <code>{deepLinkUrl}</code>
          <button type="button" className="ghost" onClick={() => setDeepLinkUrl(null)}>
            Dismiss
          </button>
        </div>
      ) : null}
      <div className="todo-form">
        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search todos"
        />
      </div>
      <form className="todo-form">
        <div className="row">
          <button type="button" className="ghost" onClick={() => void window.todoAPI.openAddWindow()}>
            Add new
          </button>
        </div>
      </form>

      <ul className="todo-list">
        {filteredTodos.map((todo) => (
          <li key={todo.id}>
            <label>
              <input
                type="checkbox"
                checked={todo.completed}
                onChange={() => void toggleTodo(todo)}
              />
              <span className="visually-hidden">Toggle completed</span>
            </label>
            <button
              type="button"
              className={todo.completed ? 'todo-title done' : 'todo-title'}
              onClick={() => void window.todoAPI.openDetailWindow(todo)}
            >
              {todo.text}
            </button>
            <button className="danger" onClick={() => void removeTodo(todo.id)}>
              Delete
            </button>
          </li>
        ))}
      </ul>
    </main>
  )
}

export default App
