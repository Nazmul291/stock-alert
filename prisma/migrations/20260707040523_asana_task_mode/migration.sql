-- AlterTable
ALTER TABLE "asana_event_mapping" ADD COLUMN     "current_task_date" VARCHAR(10),
ADD COLUMN     "current_task_gid" VARCHAR(50),
ADD COLUMN     "task_mode" VARCHAR(20) NOT NULL DEFAULT 'multi_task';
