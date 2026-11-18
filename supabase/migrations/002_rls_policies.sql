-- ==============================================================================
-- BALANCE ACADEMY — Row Level Security Policies (Supabase Migration 002)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT AS $$
  SELECT r.name
  FROM public.profiles p
  JOIN public.roles r ON r.id = p.role_id
  WHERE p.id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watch_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Profiles: users read/update own profile; super_admin manages all
CREATE POLICY "profiles_select_own_or_admin" ON public.profiles
  FOR SELECT USING (id = auth.uid() OR public.current_user_role() = 'super_admin');

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND role_id = (SELECT role_id FROM public.profiles WHERE id = auth.uid()));

-- Catalog: public reads published courses; staff manages courses/modules/lessons
CREATE POLICY "categories_public_read" ON public.categories FOR SELECT USING (TRUE);
CREATE POLICY "categories_staff_write" ON public.categories
  FOR ALL USING (public.current_user_role() IN ('super_admin', 'content_manager'));

CREATE POLICY "courses_public_read" ON public.courses
  FOR SELECT USING ((is_published = TRUE AND is_archived = FALSE) OR public.current_user_role() IN ('super_admin', 'content_manager'));
CREATE POLICY "courses_staff_write" ON public.courses
  FOR ALL USING (public.current_user_role() IN ('super_admin', 'content_manager'));

CREATE POLICY "modules_public_read" ON public.course_modules FOR SELECT USING (TRUE);
CREATE POLICY "modules_staff_write" ON public.course_modules
  FOR ALL USING (public.current_user_role() IN ('super_admin', 'content_manager'));

CREATE POLICY "lessons_read_enrolled_or_preview" ON public.lessons
  FOR SELECT USING (
    is_free_preview = TRUE
    OR public.current_user_role() IN ('super_admin', 'content_manager')
    OR EXISTS (
      SELECT 1 FROM public.enrollments e
      WHERE e.student_id = auth.uid()
        AND e.course_id = lessons.course_id
        AND e.status = 'active'
        AND (e.expires_at IS NULL OR e.expires_at > NOW())
    )
  );
CREATE POLICY "lessons_staff_write" ON public.lessons
  FOR ALL USING (public.current_user_role() IN ('super_admin', 'content_manager'));

-- Video assets: strictly hidden from students
CREATE POLICY "video_assets_staff_only" ON public.video_assets
  FOR ALL USING (public.current_user_role() IN ('super_admin', 'content_manager'));

-- Purchases: students can ONLY view & create pending purchases for themselves; NEVER approve
CREATE POLICY "purchases_student_read_own" ON public.purchases
  FOR SELECT USING (student_id = auth.uid() OR public.current_user_role() = 'super_admin');
CREATE POLICY "purchases_student_insert_pending" ON public.purchases
  FOR INSERT WITH CHECK (student_id = auth.uid() AND status = 'pending');
CREATE POLICY "purchases_admin_update" ON public.purchases
  FOR UPDATE USING (public.current_user_role() = 'super_admin');

CREATE POLICY "submissions_student_own" ON public.payment_submissions
  FOR SELECT USING (student_id = auth.uid() OR public.current_user_role() = 'super_admin');
CREATE POLICY "submissions_student_insert" ON public.payment_submissions
  FOR INSERT WITH CHECK (student_id = auth.uid());

-- Enrollments: students can NEVER insert or modify enrollments
CREATE POLICY "enrollments_student_read" ON public.enrollments
  FOR SELECT USING (student_id = auth.uid() OR public.current_user_role() = 'super_admin');
CREATE POLICY "enrollments_admin_manage" ON public.enrollments
  FOR ALL USING (public.current_user_role() = 'super_admin');

-- Lesson progress: students manage only their own progress
CREATE POLICY "progress_student_own" ON public.lesson_progress
  FOR ALL USING (student_id = auth.uid()) WITH CHECK (student_id = auth.uid());

-- Watch sessions, security logs, audit logs: admin visibility only
CREATE POLICY "watch_sessions_admin" ON public.watch_sessions
  FOR ALL USING (public.current_user_role() = 'super_admin');
CREATE POLICY "security_logs_admin" ON public.security_logs
  FOR SELECT USING (public.current_user_role() = 'super_admin');
CREATE POLICY "audit_logs_admin" ON public.audit_logs
  FOR SELECT USING (public.current_user_role() = 'super_admin');

-- Notifications: users read & mark their own read
CREATE POLICY "notifications_own" ON public.notifications
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "notifications_mark_read" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
