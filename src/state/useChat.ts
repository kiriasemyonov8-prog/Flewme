// Общая лента чата: одна на всё приложение, открывается с главной и из любого раздела.
import { useState } from 'react';
import { demoAssistant } from '../ai/assistant';
import { spentTodayMain } from '../core/balance';
import { robotMood, type Mood } from '../core/mood';
import type { FinanceStore } from './useFinance';

export interface ChatMessage {
  from: 'user' | 'flyumi';
  text: string;
}

export interface ChatStore {
  messages: ChatMessage[];
  send: (text: string) => void;
}

export function useChat(store: FinanceStore): ChatStore {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  return {
    messages,
    send(text) {
      const q = text.trim();
      if (!q) return;
      const reply = demoAssistant.reply(q, { data: store.data, today: store.today, limit: store.limit });
      if (reply.expense) store.addExpense(reply.expense);
      setMessages((m) => [...m, { from: 'user', text: q }, { from: 'flyumi', text: reply.text }]);
    },
  };
}

/** Текущее настроение Флюми: по тратам за сегодня; без данных — спокойствие. */
export function currentMood(store: FinanceStore): Mood {
  if (store.limit.status !== 'ok') return 'calm';
  return robotMood(spentTodayMain(store.data, store.today), store.limit.dailyLimit);
}
