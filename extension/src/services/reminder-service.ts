/* ============================================================
   LinkedApply Pro — Follow-up Reminder Service
   Uses chrome.alarms + chrome.notifications to remind users
   to follow up on applications after N days
   ============================================================ */

import { createLogger } from '../shared/logger';
import { getStorage, setStorage } from '../shared/storage';
import { STORAGE_KEYS } from '../shared/constants';
import type { Job } from '../shared/types';

const log = createLogger('Reminders');

const REMINDERS_KEY = STORAGE_KEYS.FOLLOW_UP_REMINDERS;
const ALARM_PREFIX = 'followup_';
const DEFAULT_FOLLOW_UP_DAYS = 7;

// ---- Types ----
export interface FollowUpReminder {
  id: string;
  jobId: string;
  jobTitle: string;
  company: string;
  reminderDate: string;    // ISO date
  status: 'pending' | 'fired' | 'dismissed' | 'completed';
  createdAt: string;
  notes: string;
}

// ================================================
//  REMINDER MANAGEMENT
// ================================================

/**
 * Schedule a follow-up reminder for a job application.
 */
export async function scheduleReminder(
  job: Job,
  daysFromNow: number = DEFAULT_FOLLOW_UP_DAYS,
  notes = ''
): Promise<FollowUpReminder> {
  const reminderDate = new Date();
  reminderDate.setDate(reminderDate.getDate() + daysFromNow);

  const reminder: FollowUpReminder = {
    id: `${ALARM_PREFIX}${job.id}_${Date.now()}`,
    jobId: job.id,
    jobTitle: job.title,
    company: job.company,
    reminderDate: reminderDate.toISOString(),
    status: 'pending',
    createdAt: new Date().toISOString(),
    notes,
  };

  // Save to storage
  const reminders = await getReminders();
  reminders.push(reminder);
  await setStorage(REMINDERS_KEY, reminders);

  // Create Chrome alarm
  const delayMs = reminderDate.getTime() - Date.now();
  await chrome.alarms.create(reminder.id, {
    when: Date.now() + delayMs,
  });

  log.info(`Reminder scheduled: ${job.company} — ${job.title} in ${daysFromNow} days`);
  return reminder;
}

/**
 * Auto-schedule reminders for newly applied jobs.
 * Called by the bot orchestrator after successful application.
 */
export async function autoScheduleReminder(job: Job): Promise<void> {
  const settings = await getStorage<{ autoRemind: boolean; followUpDays: number }>(STORAGE_KEYS.REMINDER_SETTINGS);
  if (!settings?.autoRemind) return;

  const days = settings.followUpDays || DEFAULT_FOLLOW_UP_DAYS;
  await scheduleReminder(job, days, 'Auto-scheduled follow-up');
}

/**
 * Get all reminders.
 */
export async function getReminders(): Promise<FollowUpReminder[]> {
  return await getStorage<FollowUpReminder[]>(REMINDERS_KEY) || [];
}

/**
 * Get only pending reminders.
 */
export async function getPendingReminders(): Promise<FollowUpReminder[]> {
  const reminders = await getReminders();
  return reminders.filter((r) => r.status === 'pending');
}

/**
 * Get overdue reminders (past due date, still pending).
 */
export async function getOverdueReminders(): Promise<FollowUpReminder[]> {
  const reminders = await getReminders();
  const now = new Date();
  return reminders.filter(
    (r) => r.status === 'pending' && new Date(r.reminderDate) <= now
  );
}

/**
 * Dismiss a reminder.
 */
export async function dismissReminder(reminderId: string): Promise<void> {
  await updateReminderStatus(reminderId, 'dismissed');
  await chrome.alarms.clear(reminderId);
}

/**
 * Mark a reminder as completed (user followed up).
 */
export async function completeReminder(reminderId: string): Promise<void> {
  await updateReminderStatus(reminderId, 'completed');
  await chrome.alarms.clear(reminderId);
}

/**
 * Snooze a reminder by N days.
 */
export async function snoozeReminder(reminderId: string, days: number): Promise<void> {
  const reminders = await getReminders();
  const idx = reminders.findIndex((r) => r.id === reminderId);
  if (idx < 0) return;

  const newDate = new Date();
  newDate.setDate(newDate.getDate() + days);
  reminders[idx].reminderDate = newDate.toISOString();
  reminders[idx].status = 'pending';

  await setStorage(REMINDERS_KEY, reminders);
  await chrome.alarms.clear(reminderId);
  await chrome.alarms.create(reminderId, {
    when: newDate.getTime(),
  });

  log.info(`Reminder snoozed ${days} days: ${reminderId}`);
}

/**
 * Delete a reminder permanently.
 */
export async function deleteReminder(reminderId: string): Promise<void> {
  const reminders = await getReminders();
  const filtered = reminders.filter((r) => r.id !== reminderId);
  await setStorage(REMINDERS_KEY, filtered);
  await chrome.alarms.clear(reminderId);
}

/**
 * Clean up old completed/dismissed reminders (30+ days old).
 */
export async function cleanupOldReminders(): Promise<number> {
  const reminders = await getReminders();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  const filtered = reminders.filter((r) => {
    if (r.status === 'pending') return true;
    return new Date(r.createdAt) > cutoff;
  });

  const removed = reminders.length - filtered.length;
  if (removed > 0) {
    await setStorage(REMINDERS_KEY, filtered);
    log.info(`Cleaned up ${removed} old reminders`);
  }
  return removed;
}

// ================================================
//  ALARM HANDLER (called from service-worker.ts)
// ================================================

/**
 * Handle a fired Chrome alarm. Register this in the service worker.
 */
export async function handleReminderAlarm(alarmName: string): Promise<void> {
  if (!alarmName.startsWith(ALARM_PREFIX)) return;

  const reminders = await getReminders();
  const reminder = reminders.find((r) => r.id === alarmName);
  if (!reminder || reminder.status !== 'pending') return;

  // Fire Chrome notification
  await chrome.notifications.create(alarmName, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: '🔔 Follow-Up Reminder',
    message: `Time to follow up with ${reminder.company} about "${reminder.jobTitle}"`,
    priority: 2,
    buttons: [
      { title: '✅ Done' },
      { title: '⏰ Snooze 2 days' },
    ],
    requireInteraction: true,
  });

  // Update status
  await updateReminderStatus(alarmName, 'fired');
  log.info(`Reminder fired: ${reminder.company} — ${reminder.jobTitle}`);
}

/**
 * Handle notification button clicks.
 */
export async function handleNotificationClick(
  notificationId: string,
  buttonIndex: number
): Promise<void> {
  if (!notificationId.startsWith(ALARM_PREFIX)) return;

  if (buttonIndex === 0) {
    await completeReminder(notificationId);
  } else if (buttonIndex === 1) {
    await snoozeReminder(notificationId, 2);
  }

  chrome.notifications.clear(notificationId);
}

// ---- Helpers ----

async function updateReminderStatus(
  reminderId: string,
  status: FollowUpReminder['status']
): Promise<void> {
  const reminders = await getReminders();
  const idx = reminders.findIndex((r) => r.id === reminderId);
  if (idx >= 0) {
    reminders[idx].status = status;
    await setStorage(REMINDERS_KEY, reminders);
  }
}
