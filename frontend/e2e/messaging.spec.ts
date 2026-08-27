import { expect, test, type Page } from "@playwright/test"

const BASE_API = "**/api/v1/messaging"

interface MockUser {
  id: string
  email: string
  name: string
}

interface MockMessage {
  id: string
  conversationId: string
  senderId: string
  body: string
  createdAt: string
  editedAt: string | null
  deletedAt: string | null
  attachment: null
}

interface MockConversation {
  id: string
  subjectType: string | null
  subjectId: string | null
  createdAt: string
  updatedAt: string
  participants: { userId: string; role: string; lastReadAt: string | null; joinedAt: string }[]
  lastMessage: { text: string; senderId: string; createdAt: string } | null
  unreadCount: number
}

const USER_A: MockUser = { id: "user-a-id", email: "alice@test.com", name: "Alice Tenant" }
const USER_B: MockUser = { id: "user-b-id", email: "bob@test.com", name: "Bob Landlord" }
const USER_C: MockUser = { id: "user-c-id", email: "charlie@test.com", name: "Charlie Third" }

function createMessage(
  id: string,
  conversationId: string,
  senderId: string,
  body: string,
  createdAt?: string,
): MockMessage {
  return {
    id,
    conversationId,
    senderId,
    body,
    createdAt: createdAt ?? new Date().toISOString(),
    editedAt: null,
    deletedAt: null,
    attachment: null,
  }
}

function createConversation(
  id: string,
  participants: MockUser[],
  messages: MockMessage[] = [],
): MockConversation {
  const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null
  return {
    id,
    subjectType: null,
    subjectId: null,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: lastMsg?.createdAt ?? "2024-01-01T00:00:00Z",
    participants: participants.map((u) => ({
      userId: u.id,
      role: "member",
      lastReadAt: null,
      joinedAt: "2024-01-01T00:00:00Z",
    })),
    lastMessage: lastMsg
      ? { text: lastMsg.body, senderId: lastMsg.senderId, createdAt: lastMsg.createdAt }
      : null,
    unreadCount: 0,
  }
}

function cloneConversation(c: MockConversation): MockConversation {
  return JSON.parse(JSON.stringify(c))
}

interface MockState {
  conversations: MockConversation[]
  messages: Record<string, MockMessage[]>
  nextId: number
  failNextSend: boolean
  idempotencyCache: Record<string, MockMessage>
}

function createMockState(): MockState {
  return {
    conversations: [],
    messages: {},
    nextId: 100,
    failNextSend: false,
    idempotencyCache: {},
  }
}

function getUserIdFromAuth(authHeader: string): string {
  return authHeader.replace("Bearer token-", "")
}

function userInConversation(conv: MockConversation, userId: string): boolean {
  return conv.participants.some((p) => p.userId === userId)
}

function computeUnreadCount(
  conv: MockConversation,
  userId: string,
  messages: MockMessage[],
): number {
  const participant = conv.participants.find((p) => p.userId === userId)
  if (!participant || !participant.lastReadAt) return messages.length
  return messages.filter((m) => m.senderId !== userId && new Date(m.createdAt) > new Date(participant.lastReadAt!)).length
}

function setupMocks(page: Page, state: MockState): void {
  const routeConversations = async (route: import("@playwright/test").Route) => {
    const headers = route.request().headers()
    const auth = headers["authorization"] || ""
    const userId = getUserIdFromAuth(auth)

    if (route.request().method() === "GET") {
      const userConvs = state.conversations
        .filter((c) => userInConversation(c, userId))
        .map((c) => {
          const msgs = state.messages[c.id] || []
          const unread = computeUnreadCount(c, userId, msgs)
          return { ...c, unreadCount: unread }
        })
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: userConvs, nextCursor: null }),
      })
    } else {
      await route.fulfill({ status: 405 })
    }
  }

  const routeConversationMessages = async (route: import("@playwright/test").Route) => {
    const url = route.request().url()
    const match = url.match(/\/messaging\/conversations\/([^/]+)\/messages$/)
    if (!match) {
      await route.fulfill({ status: 404 })
      return
    }
    const convId = match[1]
    const headers = route.request().headers()
    const auth = headers["authorization"] || ""
    const userId = getUserIdFromAuth(auth)

    const conv = state.conversations.find((c) => c.id === convId)
    if (!conv || !userInConversation(conv, userId)) {
      await route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ success: false, error: { message: "Forbidden" } }) })
      return
    }

    if (route.request().method() === "GET") {
      const msgs = state.messages[convId] || []
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: msgs, nextCursor: null }),
      })
    } else if (route.request().method() === "POST") {
      if (state.failNextSend) {
        state.failNextSend = false
        await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ success: false, error: { message: "Server error" } }) })
        return
      }

      const body = JSON.parse(route.request().postData() || "{}")
      const idempotencyKey = route.request().headers()["idempotency-key"]

      if (idempotencyKey && state.idempotencyCache[idempotencyKey]) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true, data: state.idempotencyCache[idempotencyKey] }),
        })
        return
      }

      const msg = createMessage(
        `mock-msg-${state.nextId++}`,
        convId,
        userId,
        body.body || "",
      )

      if (!state.messages[convId]) state.messages[convId] = []
      state.messages[convId].push(msg)

      if (idempotencyKey) state.idempotencyCache[idempotencyKey] = msg

      const convIdx = state.conversations.findIndex((c) => c.id === convId)
      if (convIdx !== -1) {
        state.conversations[convIdx] = {
          ...state.conversations[convIdx],
          lastMessage: { text: msg.body, senderId: msg.senderId, createdAt: msg.createdAt },
          updatedAt: msg.createdAt,
        }
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: msg }),
      })
    } else {
      await route.fulfill({ status: 405 })
    }
  }

  const routeRead = async (route: import("@playwright/test").Route) => {
    const url = route.request().url()
    const match = url.match(/\/messaging\/conversations\/([^/]+)\/read$/)
    if (!match) {
      await route.fulfill({ status: 404 })
      return
    }
    const convId = match[1]
    const headers = route.request().headers()
    const auth = headers["authorization"] || ""
    const userId = getUserIdFromAuth(auth)

    const conv = state.conversations.find((c) => c.id === convId)
    if (conv) {
      const pIdx = conv.participants.findIndex((p) => p.userId === userId)
      if (pIdx !== -1) {
        state.conversations[pIdx] = {
          ...conv,
          participants: conv.participants.map((p, i) =>
            i === pIdx ? { ...p, lastReadAt: new Date().toISOString() } : p,
          ),
        }
      }
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    })
  }

  const routeUnreadCount = async (route: import("@playwright/test").Route) => {
    const headers = route.request().headers()
    const auth = headers["authorization"] || ""
    const userId = getUserIdFromAuth(auth)

    let total = 0
    for (const conv of state.conversations) {
      if (userInConversation(conv, userId)) {
        const msgs = state.messages[conv.id] || []
        total += computeUnreadCount(conv, userId, msgs)
      }
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { unread: total } }),
    })
  }

  page.route(`${BASE_API}/conversations`, routeConversations)
  page.route(`${BASE_API}/conversations/*/messages`, routeConversationMessages)
  page.route(`${BASE_API}/conversations/*/read`, routeRead)
  page.route(`${BASE_API}/unread-count`, routeUnreadCount)
}

async function authenticateAs(page: Page, user: MockUser): Promise<void> {
  await page.goto("/")
  await page.evaluate((u) => {
    localStorage.setItem("shelterflex_token", `token-${u.id}`)
    localStorage.setItem(
      "shelterflex-auth-storage",
      JSON.stringify({
        state: {
          token: `token-${u.id}`,
          user: { id: u.id, email: u.email, name: u.name },
          isAuthenticated: true,
        },
        version: 1,
      }),
    )
  }, user)
}

test.describe("Messaging flow", () => {
  let state: MockState

  test.beforeEach(({ page }) => {
    state = createMockState()
    setupMocks(page, state)
  })

  test("send/receive/reply between two authenticated users", async ({ page }) => {
    const conv = createConversation("conv-srr", [USER_A, USER_B])
    state.conversations.push(cloneConversation(conv))
    state.messages["conv-srr"] = []

    await authenticateAs(page, USER_A)
    await page.goto("/messages")
    await page.waitForSelector("text=Bob Landlord")

    const inboxInput = page.getByPlaceholder("Type your message...")
    await inboxInput.fill("Hello Bob, I am interested in the property")
    await page.getByLabel("Send message").click()

    await expect(page.getByText("Hello Bob, I am interested in the property")).toBeVisible()

    await authenticateAs(page, USER_B)
    await page.goto("/messages")
    await page.waitForSelector("text=Alice Tenant")

    const convListItem = page.getByLabel("Select conversation with Alice Tenant")
    await expect(convListItem).toBeVisible()
    await convListItem.click()

    await page.waitForSelector("text=Hello Bob, I am interested in the property")

    const replyInput = page.getByPlaceholder("Type your message...")
    await replyInput.fill("Sure Alice, let me show you around!")
    await page.getByLabel("Send message").click()

    await expect(page.getByText("Sure Alice, let me show you around!")).toBeVisible()

    await authenticateAs(page, USER_A)
    await page.goto("/messages")
    await page.waitForSelector("text=Bob Landlord")

    const convItem = page.getByLabel("Select conversation with Bob Landlord")
    await convItem.click()

    await expect(page.getByText("Sure Alice, let me show you around!")).toBeVisible()
  })

  test("messages persist after page reload", async ({ page }) => {
    const msg = createMessage("msg-persist", "conv-persist", USER_B.id, "This message should survive a reload")
    const conv = createConversation("conv-persist", [USER_A, USER_B], [msg])
    state.conversations.push(cloneConversation(conv))
    state.messages["conv-persist"] = [msg]

    await authenticateAs(page, USER_A)
    await page.goto("/messages")
    await page.waitForSelector("text=Bob Landlord")

    const convItem = page.getByLabel("Select conversation with Bob Landlord")
    await convItem.click()

    await expect(page.getByText("This message should survive a reload")).toBeVisible()

    await page.reload()
    await page.waitForSelector("text=Bob Landlord")

    const convItemAfterReload = page.getByLabel("Select conversation with Bob Landlord")
    await convItemAfterReload.click()

    await expect(page.getByText("This message should survive a reload")).toBeVisible()
  })

  test("unread indicator clears after opening conversation", async ({ page }) => {
    const msg = createMessage("msg-unread", "conv-unread", USER_A.id, "You have a new message!")
    const conv = createConversation("conv-unread", [USER_A, USER_B], [msg])
    state.conversations.push(cloneConversation(conv))
    state.messages["conv-unread"] = [msg]

    await authenticateAs(page, USER_B)
    await page.goto("/messages")
    await page.waitForSelector("text=Alice Tenant")

    const unreadBadge = page.getByLabel("Select conversation with Alice Tenant").getByText("1")
    await expect(unreadBadge).toBeVisible()

    const convItem = page.getByLabel("Select conversation with Alice Tenant")
    await convItem.click()

    await expect(page.getByText("You have a new message!")).toBeVisible()

    const badgeAfterRead = page.getByLabel("Select conversation with Alice Tenant").getByText("1")
    await expect(badgeAfterRead).not.toBeVisible()
  })

  test("third user cannot access conversation they are not part of", async ({ page }) => {
    const conv = createConversation("conv-auth", [USER_A, USER_B])
    state.conversations.push(cloneConversation(conv))
    state.messages["conv-auth"] = []

    await authenticateAs(page, USER_C)
    await page.goto("/messages")

    await expect(page.getByText("No conversations yet")).toBeVisible()
    await expect(page.getByLabel("Select conversation with Alice Tenant")).not.toBeVisible()
    await expect(page.getByLabel("Select conversation with Bob Landlord")).not.toBeVisible()
  })

  test("failed send shows retry and does not duplicate on success", async ({ page }) => {
    const conv = createConversation("conv-retry", [USER_A, USER_B])
    state.conversations.push(cloneConversation(conv))
    state.messages["conv-retry"] = []

    state.failNextSend = true

    await authenticateAs(page, USER_A)
    await page.goto("/messages")
    await page.waitForSelector("text=Bob Landlord")

    const convItem = page.getByLabel("Select conversation with Bob Landlord")
    await convItem.click()

    const input = page.getByPlaceholder("Type your message...")
    await input.fill("This message will fail initially")
    await page.getByLabel("Send message").click()

    const retryButton = page.getByRole("button", { name: /retry/i })
    await expect(retryButton).toBeVisible()

    await retryButton.click()

    await expect(page.getByText("This message will fail initially")).toBeVisible()

    await expect(page.getByRole("button", { name: /retry/i })).not.toBeVisible()

    const messages = page.locator('[aria-label^="Message from you: This message will fail initially"]')
    await expect(messages).toHaveCount(1)
  })
})
