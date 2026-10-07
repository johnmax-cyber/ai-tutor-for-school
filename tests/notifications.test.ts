import { NotificationService } from "../lib/notifications/service";
import { createMockSupabase } from "./supabase-mock";
import type { NotificationInput } from "../lib/notifications/types";

let passed = 0;
let failed = 0;

function check(name: string, actual: boolean) {
  if (actual) {
    passed++;
    console.log(`PASS: ${name}`);
  } else {
    failed++;
    console.log(`FAIL: ${name}`);
  }
}

const USER_A = "user-a";
const USER_B = "user-b";

const seedNotifications = [
  {
    id: "n1",
    user_id: USER_A,
    type: "reminder",
    title: "Review Reminder",
    message: "1 topic ready for review.",
    link: "/study",
    read_at: null,
    created_at: "2026-10-06T09:00:00.000Z",
  },
  {
    id: "n2",
    user_id: USER_A,
    type: "mission",
    title: "Today's Mission",
    message: "Study bits and bytes.",
    link: "/study",
    read_at: null,
    created_at: "2026-10-07T08:00:00.000Z",
  },
  {
    id: "n3",
    user_id: USER_A,
    type: "summary",
    title: "Weekly Summary",
    message: "Great week!",
    link: "/progress",
    read_at: "2026-10-05T12:00:00.000Z",
    created_at: "2026-10-05T12:00:00.000Z",
  },
  {
    id: "n4",
    user_id: USER_B,
    type: "reminder",
    title: "Review Reminder",
    message: "2 topics ready for review.",
    link: "/study",
    read_at: null,
    created_at: "2026-10-07T09:00:00.000Z",
  },
];

const mockSupabase = createMockSupabase({
  notifications: seedNotifications,
});

const service = new NotificationService(mockSupabase);

async function runTests() {
  // --- create (single) ---
  const input: NotificationInput = {
    user_id: USER_A,
    type: "processing_complete",
    title: "Document ready",
    message: "Your PDF has been processed.",
    link: "/library",
  };
  try {
    await service.create(input);
    check("create (single) inserts a notification", true);
  } catch (err) {
    check(`create (single) inserts a notification: ${(err as Error).message}`, false);
  }

  // --- create (array) ---
  const inputs: NotificationInput[] = [
    { user_id: USER_A, type: "reminder", title: "A", message: "a", link: null },
    { user_id: USER_B, type: "reminder", title: "B", message: "b" },
  ];
  try {
    await service.create(inputs);
    check("create (array) inserts multiple notifications", true);
  } catch (err) {
    check(`create (array) inserts multiple notifications: ${(err as Error).message}`, false);
  }

  // --- listForUser (own data only) ---
  try {
    const list = await service.listForUser(USER_A);
    check("listForUser returns only own notifications", list.every((n) => n.user_id === USER_A));
    check("listForUser returns 5 for USER_A (3 seed + 2 creates)", list.length === 5);
  } catch (err) {
    check(`listForUser returns own data: ${(err as Error).message}`, false);
  }

  // --- listForUser unreadOnly ---
  try {
    const unread = await service.listForUser(USER_A, { unreadOnly: true });
    check("listForUser unreadOnly filters read", unread.every((n) => n.read_at == null));
    check("listForUser unreadOnly returns 4 unread for USER_A", unread.length === 4);
  } catch (err) {
    check(`listForUser unreadOnly: ${(err as Error).message}`, false);
  }

  // --- listForUser with limit ---
  try {
    const limited = await service.listForUser(USER_A, { limit: 2 });
    check("listForUser limit returns 2", limited.length === 2);
    check("listForUser orders by created_at desc", limited[0].created_at >= limited[1].created_at);
  } catch (err) {
    check(`listForUser limit: ${(err as Error).message}`, false);
  }

  // --- unreadCount ---
  try {
    const count = await service.unreadCount(USER_A);
    check("unreadCount returns 4 for USER_A", count === 4);
  } catch (err) {
    check(`unreadCount: ${(err as Error).message}`, false);
  }

  try {
    const count = await service.unreadCount(USER_B);
    check("unreadCount returns 2 for USER_B", count === 2);
  } catch (err) {
    check(`unreadCount USER_B: ${(err as Error).message}`, false);
  }

  // --- markRead (ownership enforced) ---
  try {
    await service.markRead("n2", USER_A);
    const n2 = (await service.listForUser(USER_A, { unreadOnly: true })).find((n) => n.id === "n2");
    check("markRead sets read_at on owned notification", n2 === undefined);
  } catch (err) {
    check(`markRead owned: ${(err as Error).message}`, false);
  }

  // markRead on a notification owned by USER_B should not affect it
  try {
    await service.markRead("n4", USER_A);
    const countB = await service.unreadCount(USER_B);
    check("markRead does not touch other user's notification", countB === 2);
  } catch (err) {
    check(`markRead cross-user: ${(err as Error).message}`, false);
  }

  // --- markAllRead (ownership enforced) ---
  try {
    await service.markAllRead(USER_A);
    const countA = await service.unreadCount(USER_A);
    check("markAllRead clears all of user A unread", countA === 0);
    const countB = await service.unreadCount(USER_B);
    check("markAllRead does not touch user B unread", countB === 2);
  } catch (err) {
    check(`markAllRead: ${(err as Error).message}`, false);
  }

  // --- deleteNotification (ownership enforced) ---
  const beforeB = await service.listForUser(USER_B);
  try {
    await service.deleteNotification("n4", USER_A);
    const afterB = await service.listForUser(USER_B);
    check("deleteNotification does not delete other user's notification", afterB.length === beforeB.length);
  } catch (err) {
    check(`deleteNotification cross-user: ${(err as Error).message}`, false);
  }

  try {
    await service.deleteNotification("n4", USER_B);
    const afterB = await service.listForUser(USER_B);
    check("deleteNotification removes owned notification", afterB.length === beforeB.length - 1);
  } catch (err) {
    check(`deleteNotification owned: ${(err as Error).message}`, false);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

runTests().catch((err) => {
  console.error("Test runner error:", err);
  process.exitCode = 1;
});
