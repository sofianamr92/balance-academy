-- ==============================================================================
-- BALANCE ACADEMY — Baseline Seed Data (Supabase)
-- ==============================================================================

INSERT INTO public.roles (name, description) VALUES
  ('super_admin', 'Full system access, payment verification, enrollments, security logs, settings'),
  ('content_manager', 'Course, module, lesson, and video asset management'),
  ('student', 'Authenticated learner browsing catalog, submitting proofs, and watching enrolled courses')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.categories (slug, name_ar, name_en, description_ar, description_en, sort_order) VALUES
  ('video-editing', 'المونتاج وصناعة الفيديو', 'Video Editing', 'مسارات عملية في المونتاج السينمائي وتصحيح الألوان وهندسة الصوت.', 'Practical workflows in commercial editing, color grading, and sound design.', 1),
  ('digital-marketing', 'التسويق الرقمي', 'Digital Marketing', 'تخطيط الحملات الإعلانية وتحليل البيانات وبناء مسارات النمو.', 'Performance media buying, conversion tracking, and measurable growth systems.', 2),
  ('programming-development', 'البرمجة وتطوير البرمجيات', 'Programming & Software Development', 'هندسة تطبيقات الويب الحديثة وقواعد البيانات وأمن الأنظمة.', 'Modern web application engineering, SQL modeling, and backend security.', 3)
ON CONFLICT (slug) DO NOTHING;
