import { FormEvent, useEffect, useState } from 'react'

type Todo = {
  id: number
  text: string
  completed: boolean
}

function App(): React.JSX.Element {
  const [todos, setTodos] = useState<Todo[]>([])
  const [newTodoText, setNewTodoText] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [isAddPage, setIsAddPage] = useState(false)

  useEffect(() => {
    const unsubscribe = window.todoAPI.onShowAddPage(() => {
      setIsAddPage(true)
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

  const createTodo = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    const trimmed = newTodoText.trim()
    if (!trimmed) return

    if (isAddPage) {
      await window.todoAPI.createFromWindow(trimmed)
      setNewTodoText('')
      window.todoAPI.closeAddWindow()
      return
    }

    const todo = await window.todoAPI.create(trimmed)
    setTodos((prev) => [todo, ...prev])
    setNewTodoText('')
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
            placeholder="What needs to be done?"
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

  return (
    <main className="todo-shell">
      <h1>Todos</h1>
      <div className="todo-form">
        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search todos"
        />
      </div>
      <form className="todo-form" onSubmit={createTodo}>
        <input
          value={newTodoText}
          onChange={(event) => setNewTodoText(event.target.value)}
          placeholder="Add a todo"
        />
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
              <span className={todo.completed ? 'done' : ''}>{todo.text}</span>
            </label>
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
