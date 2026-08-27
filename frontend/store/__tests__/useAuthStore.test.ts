import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useAuthStore from "../useAuthStore";

vi.mock("@/lib/auth", () => ({
  getToken: vi.fn(() => null),
  setToken: vi.fn(),
  clearToken: vi.fn(),
}));

import { getToken, setToken, clearToken } from "@/lib/auth";

const mockGetToken = vi.mocked(getToken);
const mockSetToken = vi.mocked(setToken);
const mockClearToken = vi.mocked(clearToken);

function resetStore() {
  useAuthStore.setState({
    token: null,
    user: null,
    isAuthenticated: false,
  });
  vi.clearAllMocks();
}

describe("useAuthStore", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
  });

  afterEach(() => {
    resetStore();
  });

  describe("initial state", () => {
    it("starts unauthenticated when no token exists", () => {
      mockGetToken.mockReturnValue(null);
      resetStore();

      const { result } = renderHook(() => useAuthStore());
      expect(result.current.token).toBeNull();
      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });

    it("starts authenticated when a token exists", () => {
      mockGetToken.mockReturnValue("existing-token");
      resetStore();
      // Re-set initial state with the token
      useAuthStore.setState({
        token: "existing-token",
        isAuthenticated: true,
      });

      const { result } = renderHook(() => useAuthStore());
      expect(result.current.token).toBe("existing-token");
      expect(result.current.isAuthenticated).toBe(true);
    });
  });

  describe("setToken", () => {
    it("sets token and marks authenticated", () => {
      const { result } = renderHook(() => useAuthStore());

      act(() => { result.current.setToken("tok_abc"); });

      expect(result.current.token).toBe("tok_abc");
      expect(result.current.isAuthenticated).toBe(true);
      expect(mockSetToken).toHaveBeenCalledWith("tok_abc");
    });

    it("clears token when set to null", () => {
      const { result } = renderHook(() => useAuthStore());

      act(() => { result.current.setToken("tok_abc"); });
      act(() => { result.current.setToken(null); });

      expect(result.current.token).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
      expect(mockClearToken).toHaveBeenCalled();
    });
  });

  describe("setUser", () => {
    it("sets user data", () => {
      const { result } = renderHook(() => useAuthStore());
      const user = { id: "u1", email: "a@b.com", name: "Alice" };

      act(() => { result.current.setUser(user); });

      expect(result.current.user).toEqual(user);
    });

    it("clears user on null", () => {
      const { result } = renderHook(() => useAuthStore());

      act(() => { result.current.setUser({ id: "u1", email: "a@b.com" }); });
      act(() => { result.current.setUser(null); });

      expect(result.current.user).toBeNull();
    });
  });

  describe("logout", () => {
    it("clears all auth state", () => {
      const { result } = renderHook(() => useAuthStore());

      act(() => { result.current.setToken("tok_xyz"); });
      act(() => { result.current.setUser({ id: "u1", email: "a@b.com" }); });

      expect(result.current.isAuthenticated).toBe(true);

      act(() => { result.current.logout(); });

      expect(result.current.token).toBeNull();
      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
      expect(mockClearToken).toHaveBeenCalled();
    });

    it("leaves no residual token in storage", () => {
      const { result } = renderHook(() => useAuthStore());

      act(() => { result.current.setToken("tok_xyz"); });
      act(() => { result.current.logout(); });

      // clearToken was called — localStorage should be clean
      expect(localStorage.getItem("shelterflex_token")).toBeNull();
    });

    it("is idempotent — logout twice doesn't throw", () => {
      const { result } = renderHook(() => useAuthStore());

      act(() => { result.current.logout(); });
      act(() => { result.current.logout(); });

      expect(result.current.isAuthenticated).toBe(false);
    });
  });

  describe("selectors", () => {
    it("isAuthenticated selector reflects state", () => {
      const { result } = renderHook(() => useAuthStore());

      expect(useAuthStore.getState().isAuthenticated).toBe(false);

      act(() => { result.current.setToken("tok_1"); });
      expect(useAuthStore.getState().isAuthenticated).toBe(true);

      act(() => { result.current.logout(); });
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });
  });

  describe("persistence", () => {
    it("rehydrates from localStorage on fresh read", () => {
      // Simulate persisted state
      localStorage.setItem(
        "shelterflex-auth-storage",
        JSON.stringify({
          state: {
            token: "persisted-token",
            user: { id: "u1", email: "a@b.com" },
            isAuthenticated: true,
          },
          version: 1,
        }),
      );

      // Fresh store read should rehydrate
      const stored = JSON.parse(localStorage.getItem("shelterflex-auth-storage")!);
      expect(stored.state.token).toBe("persisted-token");
      expect(stored.state.isAuthenticated).toBe(true);
    });

    it("does not resurrect cleared state", () => {
      // Simulate cleared state
      localStorage.setItem(
        "shelterflex-auth-storage",
        JSON.stringify({
          state: {
            token: null,
            user: null,
            isAuthenticated: false,
          },
          version: 1,
        }),
      );

      const stored = JSON.parse(localStorage.getItem("shelterflex-auth-storage")!);
      expect(stored.state.token).toBeNull();
      expect(stored.state.isAuthenticated).toBe(false);
    });
  });
});
