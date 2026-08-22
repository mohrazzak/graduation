-- Preserve all PHI-Net rows while adding Raed's independent four-class scale.
alter table public.analyses add column if not exists scale_version text;
update public.analyses set scale_version = 'phi3' where scale_version is null;
alter table public.analyses alter column scale_version set default 'raed4';
alter table public.analyses alter column scale_version set not null;

alter table public.analyses alter column tier drop not null;
alter table public.analyses alter column probabilities drop not null;
alter table public.analyses alter column damage_percent drop not null;

alter table public.analyses add column if not exists class_code text;
alter table public.analyses add column if not exists scores jsonb;
alter table public.analyses add column if not exists detections jsonb;
alter table public.analyses add column if not exists model3d_before_path text;

alter table public.analyses add constraint analyses_scale_version_check
  check (scale_version in ('phi3', 'raed4'));
alter table public.analyses add constraint analyses_class_code_check
  check (class_code is null or class_code in ('ND', 'SMD', 'HVD', 'TD'));
alter table public.analyses add constraint analyses_version_payload_check check (
  (scale_version = 'phi3' and tier is not null and probabilities is not null
    and damage_percent is not null and class_code is null and scores is null and detections is null)
  or
  (scale_version = 'raed4' and tier is null and probabilities is null
    and damage_percent is null and class_code is not null and scores is not null and detections is not null)
);
