'use client';

import React, { useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Settings,
  Plus,
  Smile,
  Send,
  Paperclip,
  Bot,
  Hash,
  User,
  X,
} from 'lucide-react';
import { ChatBubblesIllustration } from './Illustrations';

interface Message {
  id: string;
  sender: string;
  avatarText: string;
  time: string;
  text: string;
  isSelf?: boolean;
}

export function ChatView() {
  const [activeFilter, setActiveFilter] = useState<'all' | 'mentions' | 'unread' | 'more'>('all');
  const [selectedChat, setSelectedChat] = useState<string | null>(null);

  // Collapsible sections
  const [openSections, setOpenSections] = useState({
    apps: false,
    chats: true,
    starred: false,
    shared: false,
  });

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // Messages for different channels
  const [chatMessages, setChatMessages] = useState<Record<string, Message[]>>({
    'ai-companion': [
      {
        id: '1',
        sender: 'Zoom AI Companion',
        avatarText: 'AI',
        time: '9:00 AM',
        text: 'Hello Sahil! I am your AI Companion. You can ask me to draft meeting agendas, summarize chats, or answer questions.',
      },
    ],
    general: [
      {
        id: '1',
        sender: 'Sarah Chen',
        avatarText: 'SC',
        time: '10:05 AM',
        text: 'Hey team, welcome to our Zoom Workplace workspace!',
      },
      {
        id: '2',
        sender: 'Alex Rivera',
        avatarText: 'AR',
        time: '10:12 AM',
        text: 'Looks awesome! Let me know if anyone wants to jump on a quick test call.',
      },
    ],
    standup: [
      {
        id: '1',
        sender: 'David Miller',
        avatarText: 'DM',
        time: '9:30 AM',
        text: 'Daily Standup sync at 11:00 AM today.',
      },
    ],
    self: [
      {
        id: '1',
        sender: 'Sahil Dargar (You)',
        avatarText: 'SD',
        time: 'Yesterday',
        text: 'Notes to self: Review meeting schedule and prepare slides for the presentation.',
        isSelf: true,
      },
    ],
  });

  const [inputMessage, setInputMessage] = useState('');

  const handleSendMessage = () => {
    if (!inputMessage.trim() || !selectedChat) return;

    const newMsg: Message = {
      id: Date.now().toString(),
      sender: 'Sahil Dargar (You)',
      avatarText: 'SD',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      text: inputMessage.trim(),
      isSelf: true,
    };

    setChatMessages((prev) => ({
      ...prev,
      [selectedChat]: [...(prev[selectedChat] || []), newMsg],
    }));

    setInputMessage('');

    if (selectedChat === 'ai-companion') {
      setTimeout(() => {
        const aiReply: Message = {
          id: (Date.now() + 1).toString(),
          sender: 'Zoom AI Companion',
          avatarText: 'AI',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          text: `Got it! I am summarizing that: "${newMsg.text}". Let me know if you need anything else!`,
        };
        setChatMessages((prev) => ({
          ...prev,
          'ai-companion': [...(prev['ai-companion'] || []), aiReply],
        }));
      }, 1000);
    }
  };

  const getChatTitle = () => {
    switch (selectedChat) {
      case 'ai-companion':
        return 'Zoom AI Companion';
      case 'general':
        return '# General';
      case 'standup':
        return '# Team Standup';
      case 'self':
        return 'Sahil Dargar (Personal Note)';
      default:
        return 'Chat';
    }
  };

  return (
    <div className="zoom-chat-layout">
      {/* Left Chat Sidebar Pane */}
      <div className="zoom-chat-sidebar">
        {/* Header */}
        <div className="zoom-chat-header">
          <div className="zoom-chat-title-group">
            <span className="zoom-chat-title">Chat</span>
            <ChevronDown size={14} className="zoom-chat-caret" />
          </div>

          <div className="zoom-chat-header-actions">
            <button className="zoom-chat-icon-btn" title="Chat Settings">
              <Settings size={16} />
            </button>
            <button
              className="zoom-chat-plus-btn"
              onClick={() => setSelectedChat('general')}
              title="New Chat"
              aria-label="New Chat"
            >
              <Plus size={15} color="#FFFFFF" strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="zoom-chat-filters">
          <button
            className={`zoom-filter-pill ${activeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setActiveFilter('all')}
          >
            All
          </button>
          <button
            className={`zoom-filter-pill ${activeFilter === 'mentions' ? 'active' : ''}`}
            onClick={() => setActiveFilter('mentions')}
          >
            @
          </button>
          <button
            className={`zoom-filter-pill ${activeFilter === 'unread' ? 'active' : ''}`}
            onClick={() => setActiveFilter('unread')}
          >
            💬
          </button>
          <button
            className={`zoom-filter-pill ${activeFilter === 'more' ? 'active' : ''}`}
            onClick={() => setActiveFilter('more')}
          >
            ...
          </button>
        </div>

        {/* Channels & Tree List */}
        <div className="zoom-chat-tree">
          {/* Apps */}
          <div className="zoom-tree-section">
            <div
              className="zoom-tree-header"
              onClick={() => toggleSection('apps')}
            >
              {openSections.apps ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
              <span>Apps</span>
            </div>
            {openSections.apps && (
              <div className="zoom-tree-items">
                <div
                  className={`zoom-tree-item ${selectedChat === 'ai-companion' ? 'active' : ''}`}
                  onClick={() => setSelectedChat('ai-companion')}
                >
                  <Bot size={15} className="tree-icon ai" />
                  <span>Zoom AI Companion</span>
                </div>
              </div>
            )}
          </div>

          {/* Chats & Channels */}
          <div className="zoom-tree-section">
            <div
              className="zoom-tree-header"
              onClick={() => toggleSection('chats')}
            >
              {openSections.chats ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
              <span>Chats & Channels</span>
            </div>
            {openSections.chats && (
              <div className="zoom-tree-items">
                <div
                  className={`zoom-tree-item ${selectedChat === 'general' ? 'active' : ''}`}
                  onClick={() => setSelectedChat('general')}
                >
                  <Hash size={14} className="tree-icon" />
                  <span>general</span>
                </div>
                <div
                  className={`zoom-tree-item ${selectedChat === 'standup' ? 'active' : ''}`}
                  onClick={() => setSelectedChat('standup')}
                >
                  <Hash size={14} className="tree-icon" />
                  <span>team-standup</span>
                </div>
                <div
                  className={`zoom-tree-item ${selectedChat === 'self' ? 'active' : ''}`}
                  onClick={() => setSelectedChat('self')}
                >
                  <User size={14} className="tree-icon" />
                  <span>Sahil Dargar (You)</span>
                </div>
              </div>
            )}
          </div>

          {/* Starred */}
          <div className="zoom-tree-section">
            <div
              className="zoom-tree-header"
              onClick={() => toggleSection('starred')}
            >
              {openSections.starred ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
              <span>Starred</span>
            </div>
            {openSections.starred && (
              <div className="zoom-tree-items">
                <div className="zoom-tree-empty">No starred chats</div>
              </div>
            )}
          </div>

          {/* Shared Spaces */}
          <div className="zoom-tree-section">
            <div
              className="zoom-tree-header"
              onClick={() => toggleSection('shared')}
            >
              {openSections.shared ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
              <span>Shared spaces</span>
            </div>
            {openSections.shared && (
              <div className="zoom-tree-items">
                <div className="zoom-tree-empty">No shared spaces</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Chat Content Area */}
      <div className="zoom-chat-main">
        {!selectedChat ? (
          /* Empty Chat State (Screenshot 2) */
          <div className="zoom-chat-empty-state">
            <ChatBubblesIllustration className="zoom-chat-illustration" />
            <p className="zoom-chat-empty-caption">
              Start chatting by clicking or creating a chat in the left sidebar.
            </p>
          </div>
        ) : (
          /* Active Chat Conversation View */
          <div className="zoom-chat-conversation">
            {/* Conversation Header */}
            <div className="zoom-conv-header">
              <div className="zoom-conv-title-box">
                <h3>{getChatTitle()}</h3>
                <span className="zoom-conv-subtitle">Direct Team Workspace Message</span>
              </div>
              <div className="zoom-conv-actions">
                <button
                  className="zoom-icon-btn"
                  onClick={() => setSelectedChat(null)}
                  title="Close conversation"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Conversation Message List */}
            <div className="zoom-conv-feed">
              {(chatMessages[selectedChat] || []).map((msg) => (
                <div key={msg.id} className={`zoom-msg-bubble ${msg.isSelf ? 'self' : ''}`}>
                  <div className="zoom-msg-avatar">{msg.avatarText}</div>
                  <div className="zoom-msg-content">
                    <div className="zoom-msg-meta">
                      <strong>{msg.sender}</strong>
                      <span className="zoom-msg-time">{msg.time}</span>
                    </div>
                    <div className="zoom-msg-text">{msg.text}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Input Bar */}
            <div className="zoom-conv-input-area">
              <div className="zoom-conv-input-box">
                <input
                  type="text"
                  placeholder={`Message ${getChatTitle()}...`}
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSendMessage();
                  }}
                  autoFocus
                />
                <div className="zoom-conv-tools">
                  <div className="zoom-tools-left">
                    <button className="tool-btn" title="Add emoji">
                      <Smile size={16} />
                    </button>
                    <button className="tool-btn" title="Attach file">
                      <Paperclip size={16} />
                    </button>
                  </div>
                  <button
                    className="zoom-send-btn"
                    onClick={handleSendMessage}
                    disabled={!inputMessage.trim()}
                    title="Send message"
                  >
                    <Send size={15} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
