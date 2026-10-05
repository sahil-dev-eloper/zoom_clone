'use client';

import React, { useState } from 'react';
import {
  Search,
  UserPlus,
  Video,
  MessageSquare,
  Star,
  Users,
  Building,
} from 'lucide-react';

interface ContactItem {
  id: string;
  name: string;
  email: string;
  avatar: string;
  status: 'available' | 'busy' | 'away' | 'offline';
  department: string;
  starred?: boolean;
}

interface ContactsViewProps {
  onStartMeetingWith: (contactName: string) => void;
  onOpenChatWith: (contactName: string) => void;
}

export function ContactsView({ onStartMeetingWith, onOpenChatWith }: ContactsViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'company' | 'starred'>('all');

  const contactsList: ContactItem[] = [
    {
      id: '1',
      name: 'Alex Rivera',
      email: 'alex.rivera@zoomworkplace.dev',
      avatar: 'AR',
      status: 'available',
      department: 'Engineering',
      starred: true,
    },
    {
      id: '2',
      name: 'Sarah Chen',
      email: 'sarah.chen@zoomworkplace.dev',
      avatar: 'SC',
      status: 'busy',
      department: 'Product Design',
      starred: true,
    },
    {
      id: '3',
      name: 'David Miller',
      email: 'david.miller@zoomworkplace.dev',
      avatar: 'DM',
      status: 'away',
      department: 'Infrastructure',
    },
    {
      id: '4',
      name: 'Elena Rostova',
      email: 'elena.rostova@zoomworkplace.dev',
      avatar: 'ER',
      status: 'available',
      department: 'Operations',
    },
    {
      id: '5',
      name: 'Michael Chang',
      email: 'michael.chang@zoomworkplace.dev',
      avatar: 'MC',
      status: 'offline',
      department: 'Marketing',
    },
  ];

  const filteredContacts = contactsList.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.department.toLowerCase().includes(searchTerm.toLowerCase());

    if (selectedCategory === 'starred') return matchesSearch && c.starred;
    return matchesSearch;
  });

  return (
    <div className="zoom-contacts-layout">
      {/* Left Contacts Sidebar */}
      <div className="zoom-contacts-sidebar">
        <div className="zoom-contacts-header">
          <div className="zoom-contacts-search-box">
            <Search size={14} className="search-icon" />
            <input
              type="text"
              placeholder="Search contacts..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="zoom-icon-btn plus" title="Add Contact">
            <UserPlus size={16} />
          </button>
        </div>

        {/* Categories */}
        <div className="zoom-contacts-categories">
          <button
            className={`category-item ${selectedCategory === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('all')}
          >
            <Users size={16} />
            <span>All Contacts</span>
            <span className="count-badge">{contactsList.length}</span>
          </button>

          <button
            className={`category-item ${selectedCategory === 'starred' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('starred')}
          >
            <Star size={16} />
            <span>Starred</span>
            <span className="count-badge">2</span>
          </button>

          <button
            className={`category-item ${selectedCategory === 'company' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('company')}
          >
            <Building size={16} />
            <span>Company Directory</span>
            <span className="count-badge">{contactsList.length}</span>
          </button>
        </div>
      </div>

      {/* Right Contacts Directory Grid */}
      <div className="zoom-contacts-main">
        <div className="zoom-contacts-title-bar">
          <h2>Contacts Directory</h2>
          <span className="contacts-count">{filteredContacts.length} contacts</span>
        </div>

        <div className="zoom-contacts-grid">
          {filteredContacts.map((contact) => (
            <div key={contact.id} className="zoom-contact-card">
              <div className="contact-avatar-wrap">
                <div className="contact-avatar">{contact.avatar}</div>
                <span className={`contact-status-dot ${contact.status}`} />
              </div>

              <div className="contact-details">
                <h4>{contact.name}</h4>
                <p className="contact-email">{contact.email}</p>
                <span className="contact-dept">{contact.department}</span>
              </div>

              <div className="contact-card-actions">
                <button
                  className="contact-act-btn meet"
                  title="Start Meeting"
                  onClick={() => onStartMeetingWith(contact.name)}
                >
                  <Video size={15} />
                  <span>Meet</span>
                </button>

                <button
                  className="contact-act-btn chat"
                  title="Chat"
                  onClick={() => onOpenChatWith(contact.name)}
                >
                  <MessageSquare size={15} />
                  <span>Chat</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
