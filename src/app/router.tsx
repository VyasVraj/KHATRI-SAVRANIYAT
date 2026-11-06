/**
 * Application Router
 *
 * Route structure:
 * - / (RootLayout)
 *   - / → HomePage
 *   - [ProtectedRoute]
 *     - /profile → ProfilePage
 *     - /discover → DiscoverPage
 *     - /family → FamilyPage
 *     - /community → CommunityPage
 * - /auth (GuestOnlyRoute — redirects authenticated users to home)
 *   - /auth/sign-in → SignInPage
 *   - /auth/sign-up → SignUpPage
 *   - /auth/forgot-password → ForgotPasswordPage
 * - /auth/reset-password → ResetPasswordPage (no guard — needs auth token from URL)
 * - /auth/callback → AuthCallbackPage (no guard — handles email confirmation)
 * - * → NotFoundPage
 *
 * NOTE: Route guards are UX only.
 * All real authorization is enforced by PostgreSQL RLS policies.
 */

import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { ROUTES } from '@/constants/app'
import { RootLayout } from '@/components/layout/RootLayout'
import { HomePage } from '@/features/home/pages/HomePage'
import { NotFoundPage, RouteErrorPage } from '@/features/errors'
import { ProtectedRoute, GuestOnlyRoute } from '@/components/common/ProtectedRoute'
import { ModeratorRoute } from '@/components/common/ModeratorRoute'
import { AdminRoute } from '@/components/common/AdminRoute'
import { AdminLayout } from '@/features/admin'

const router = createBrowserRouter([
  {
    // Main layout — public + protected routes sharing the header/footer
    path: '/',
    element: <RootLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        index: true,
        element: <HomePage />,
      },
      // Public invitation preview / redemption route (Phase 8 Subtask 4B)
      {
        path: '/invite/:token',
        lazy: () =>
          import('@/features/invitations/pages/InvitationRedemptionPage').then((m) => ({
            Component: m.InvitationRedemptionPage,
          })),
      },
      // Protected routes — require authentication
      {
        element: <ProtectedRoute />,
        children: [
          {
            path: ROUTES.PROFILE,
            lazy: () =>
              import('@/features/profile/pages/ProfilePage').then((m) => ({
                Component: m.ProfilePage,
              })),
          },
          {
            path: ROUTES.SETTINGS,
            element: <Navigate to="/profile?tab=settings" replace />,
          },
          {
            path: ROUTES.DISCOVER,
            lazy: () =>
              import('@/features/discover/pages/DiscoverPage').then((m) => ({
                Component: m.DiscoverPage,
              })),
          },
          {
            path: ROUTES.FAMILY,
            element: <Navigate to={ROUTES.FAMILIES} replace />,
          },
          {
            path: ROUTES.COMMUNITY,
            lazy: () =>
              import('@/features/community/pages/CommunityPage').then((m) => ({
                Component: m.CommunityPage,
              })),
          },
          {
            path: '/panchang',
            element: <Navigate to="/community?tab=panchang" replace />,
          },
          {
            path: '/mukhi',
            element: <Navigate to="/community?tab=mukhi" replace />,
          },
          {
            path: '/committees',
            element: <Navigate to="/community?tab=committees" replace />,
          },
          {
            path: '/panchayat',
            element: <Navigate to="/community?tab=panchayat" replace />,
          },
          {
            path: '/circulars',
            element: <Navigate to="/community?tab=circulars" replace />,
          },
          {
            path: ROUTES.CONNECTIONS,
            lazy: () =>
              import('@/features/connections/pages/ConnectionsPage').then((m) => ({
                Component: m.ConnectionsPage,
              })),
          },
          // Notifications (Phase 12)
          {
            path: ROUTES.NOTIFICATIONS,
            lazy: () =>
              import('@/features/notifications/pages/NotificationsPage').then((m) => ({
                Component: m.NotificationsPage,
              })),
          },
          {
            path: ROUTES.NOTIFICATION_PREFERENCES,
            lazy: () =>
              import('@/features/notifications/pages/NotificationPreferencesPage').then((m) => ({
                Component: m.NotificationPreferencesPage,
              })),
          },
          // People routes (Phase 3)
          {
            path: ROUTES.PEOPLE,
            lazy: () =>
              import('@/features/people/pages/PersonListPage').then((m) => ({
                Component: m.PersonListPage,
              })),
          },
          {
            path: ROUTES.PERSON_CREATE,
            lazy: () =>
              import('@/features/people/pages/PersonCreatePage').then((m) => ({
                Component: m.PersonCreatePage,
              })),
          },
          {
            path: '/people/:personId',
            lazy: () =>
              import('@/features/people/pages/PersonDetailPage').then((m) => ({
                Component: m.PersonDetailPage,
              })),
          },
          {
            path: '/people/:personId/edit',
            lazy: () =>
              import('@/features/people/pages/PersonEditPage').then((m) => ({
                Component: m.PersonEditPage,
              })),
          },
          {
            path: '/people/:personId/tree',
            lazy: () =>
              import('@/features/tree/pages/FamilyTreePage').then((m) => ({
                Component: m.FamilyTreePage,
              })),
          },
          {
            path: '/families/:familyId/tree',
            lazy: () =>
              import('@/features/tree/pages/FamilyTreePage').then((m) => ({
                Component: m.FamilyTreePage,
              })),
          },
          {
            path: '/tree',
            lazy: () =>
              import('@/features/tree/pages/FamilyTreePage').then((m) => ({
                Component: m.FamilyTreePage,
              })),
          },
          // Families routes (Phase 3)
          {
            path: ROUTES.FAMILIES,
            lazy: () =>
              import('@/features/families/pages/FamilyListPage').then((m) => ({
                Component: m.FamilyListPage,
              })),
          },
          {
            path: ROUTES.FAMILY_CREATE,
            lazy: () =>
              import('@/features/families/pages/FamilyCreatePage').then((m) => ({
                Component: m.FamilyCreatePage,
              })),
          },
          {
            path: '/families/:familyId',
            lazy: () =>
              import('@/features/families/pages/FamilyDetailPage').then((m) => ({
                Component: m.FamilyDetailPage,
              })),
          },
          {
            path: '/families/:familyId/edit',
            lazy: () =>
              import('@/features/families/pages/FamilyEditPage').then((m) => ({
                Component: m.FamilyEditPage,
              })),
          },
          // Moderator / Admin routes (Phase 8 Subtask 3 & Phase 9 Subtask 3)
          {
            element: <ModeratorRoute />,
            children: [
              {
                path: ROUTES.CLAIM_REVIEW_QUEUE,
                lazy: () =>
                  import('@/features/claims/pages/ClaimReviewQueuePage').then((m) => ({
                    Component: m.ClaimReviewQueuePage,
                  })),
              },
              {
                path: ROUTES.VERIFICATION_REVIEW_QUEUE,
                lazy: () =>
                  import('@/features/verification/pages/VerificationReviewQueuePage').then((m) => ({
                    Component: m.VerificationReviewQueuePage,
                  })),
              },
            ],
          },
          // Route Aliases & Redirects for notification action_urls and legacy links
          {
            path: '/claims',
            element: <Navigate to={ROUTES.CLAIM_REVIEW_QUEUE} replace />,
          },
          {
            path: '/verification',
            element: <Navigate to={ROUTES.VERIFICATION_REVIEW_QUEUE} replace />,
          },
          {
            path: '/verifications',
            element: <Navigate to={ROUTES.VERIFICATION_REVIEW_QUEUE} replace />,
          },
          {
            path: '/community/groups',
            element: <Navigate to={ROUTES.COMMUNITY} replace />,
          },
          {
            path: '/community/groups/*',
            element: <Navigate to={ROUTES.COMMUNITY} replace />,
          },
          {
            path: '/community/events',
            element: <Navigate to="/community?tab=events" replace />,
          },
          {
            path: '/community/events/*',
            element: <Navigate to="/community?tab=events" replace />,
          },
          {
            path: '/family/media',
            element: <Navigate to={ROUTES.FAMILIES} replace />,
          },
          {
            path: '/family/media/*',
            element: <Navigate to={ROUTES.FAMILIES} replace />,
          },
          {
            path: '/family/history',
            element: <Navigate to={ROUTES.FAMILIES} replace />,
          },
          {
            path: '/family/history/*',
            element: <Navigate to={ROUTES.FAMILIES} replace />,
          },
          // Platform Administration routes (Phase 13)
          {
            element: <AdminRoute />,
            children: [
              {
                element: <AdminLayout />,
                children: [
                  {
                    path: ROUTES.ADMIN,
                    lazy: () =>
                      import('@/features/admin/pages/AdminDashboardPage').then((m) => ({
                        Component: m.AdminDashboardPage,
                      })),
                  },
                  {
                    path: ROUTES.ADMIN_USERS,
                    lazy: () =>
                      import('@/features/admin/pages/UserManagementPage').then((m) => ({
                        Component: m.UserManagementPage,
                      })),
                  },
                  {
                    path: ROUTES.ADMIN_AUDIT,
                    lazy: () =>
                      import('@/features/admin/pages/AuditLogPage').then((m) => ({
                        Component: m.AuditLogPage,
                      })),
                  },
                  {
                    path: ROUTES.ADMIN_DUPLICATES,
                    lazy: () =>
                      import('@/features/admin/pages/DuplicateManagementPage').then((m) => ({
                        Component: m.DuplicateManagementPage,
                      })),
                  },
                  {
                    path: ROUTES.ADMIN_IMPORT,
                    lazy: () =>
                      import('@/features/admin/pages/ImportManagementPage').then((m) => ({
                        Component: m.ImportManagementPage,
                      })),
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },

  // Auth routes — guest only (redirect authenticated users to home)
  {
    path: '/auth',
    element: <GuestOnlyRoute />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        path: 'sign-in',
        lazy: () =>
          import('@/features/auth/pages/SignInPage').then((m) => ({
            Component: m.SignInPage,
          })),
      },
      {
        path: 'sign-up',
        lazy: () =>
          import('@/features/auth/pages/SignUpPage').then((m) => ({
            Component: m.SignUpPage,
          })),
      },
      {
        path: 'forgot-password',
        lazy: () =>
          import('@/features/auth/pages/ForgotPasswordPage').then((m) => ({
            Component: m.ForgotPasswordPage,
          })),
      },
    ],
  },

  // Reset password — no guest guard (user is unauthenticated when they arrive)
  {
    path: ROUTES.RESET_PASSWORD,
    errorElement: <RouteErrorPage />,
    lazy: () =>
      import('@/features/auth/pages/ResetPasswordPage').then((m) => ({
        Component: m.ResetPasswordPage,
      })),
  },

  // Auth callback — handles email confirmation links from Supabase
  {
    path: ROUTES.AUTH_CALLBACK,
    errorElement: <RouteErrorPage />,
    lazy: () =>
      import('@/features/auth/pages/AuthCallbackPage').then((m) => ({
        Component: m.AuthCallbackPage,
      })),
  },

  // 404
  {
    path: '*',
    element: <NotFoundPage />,
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
