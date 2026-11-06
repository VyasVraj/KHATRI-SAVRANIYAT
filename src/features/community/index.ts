/**
 * Community Feature Domain Public API (Phase 10 — Subtasks 1, 2 & 3)
 */

export * from './types'

// Groups (Subtask 1)
export * from './schemas/group.schemas'
export * from './services/groups.service'
export * from './hooks/useGroups'
export * from './components/GroupTypeBadge'
export * from './components/GroupCard'
export * from './components/GroupFiltersBar'
export * from './components/CreateGroupModal'
export * from './components/GroupsCatalog'

// Announcements (Subtask 2)
export * from './schemas/announcement.schemas'
export * from './services/announcements.service'
export * from './hooks/useAnnouncements'
export * from './components/AnnouncementTypeBadge'
export * from './components/AnnouncementCard'
export * from './components/AnnouncementFiltersBar'
export * from './components/AnnouncementDetailModal'
export * from './components/CreateAnnouncementModal'
export * from './components/EditAnnouncementModal'
export * from './components/AnnouncementsFeed'

// Events & RSVPs (Subtask 3)
export * from './schemas/event.schemas'
export * from './services/events.service'
export * from './hooks/useEvents'
export * from './components/EventTypeBadge'
export * from './components/EventStatusBadge'
export * from './components/RsvpButtonGroup'
export * from './components/EventCard'
export * from './components/EventFiltersBar'
export * from './components/EventDetailModal'
export * from './components/CreateEventModal'
export * from './components/EditEventModal'
export * from './components/CancelEventModal'
export * from './components/EventsFeed'

// Birthdays (Subtask 4 / ANDROID-9)
export * from './services/birthdays.service'
export * from './hooks/useBirthdays'
export * from './components/BirthdayCard'
export * from './components/BirthdayFiltersBar'
export * from './components/BirthdaysFeed'

// Sindhi Panchang / Lunar Calendar (ANDROID-10)
export * from './services/panchang.service'
export * from './hooks/usePanchang'
export * from './components/PanchangFiltersBar'
export * from './components/PanchangLegend'
export * from './components/PanchangMonthView'
export * from './components/PanchangDayDetail'
export * from './components/PanchangView'

// Mukhi Leadership Directory (ANDROID-11)
export * from './services/mukhi.service'
export * from './hooks/useMukhiDirectory'
export * from './components/MukhiCard'
export * from './components/MukhiFiltersBar'
export * from './components/MukhiDirectoryView'

// Committees & Governance (ANDROID-13 — Screens 44–45)
export * from './services/committees.service'
export * from './hooks/useCommittees'
export * from './components/CommitteeCard'
export * from './components/CommitteeFiltersBar'
export * from './components/CommitteeDetailModal'
export * from './components/CommitteeDirectoryView'

// Panchayat Leadership Directory (ANDROID-13 — Screen 46)
export * from './services/panchayat.service'
export * from './hooks/usePanchayat'
export * from './components/PanchayatCard'
export * from './components/PanchayatFiltersBar'
export * from './components/PanchayatDirectoryView'

// Circulars & Official Directives (ANDROID-13 — Screens 47–49)
export * from './services/circulars.service'
export * from './hooks/useCirculars'
export * from './components/CircularCard'
export * from './components/CircularFiltersBar'
export * from './components/CircularDetailModal'
export * from './components/CircularsView'

// Official Community Mukhi Directory (118 records from PDF)
export * from './constants/mukhis.data'
export * from './services/community-mukhis.service'
export * from './hooks/useCommunityMukhis'
export * from './components/CommunityMukhiCard'
export * from './components/CommunityMukhiDirectoryView'

// Page
export * from './pages/CommunityPage'

