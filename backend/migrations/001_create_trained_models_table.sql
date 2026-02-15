-- Create the trained_models table for storing trained model metadata
CREATE TABLE IF NOT EXISTS public.trained_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  playground_id UUID NOT NULL REFERENCES public.playgrounds(id) ON DELETE CASCADE,

  -- Model metadata
  name TEXT NOT NULL,
  description TEXT,

  -- Storage reference
  model_storage_path TEXT NOT NULL,  -- Path in Supabase Storage
  model_size_bytes INT,

  -- Context needed for inference
  graph_json JSONB NOT NULL,           -- The graph used to train
  training_config JSONB NOT NULL,      -- Training configuration

  -- Statistics
  final_loss FLOAT,
  final_accuracy FLOAT,
  metrics_history JSONB,               -- Full training history

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create indexes for common queries
CREATE INDEX idx_trained_models_user_id ON public.trained_models(user_id);
CREATE INDEX idx_trained_models_playground_id ON public.trained_models(playground_id);
CREATE INDEX idx_trained_models_created_at ON public.trained_models(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.trained_models ENABLE ROW LEVEL SECURITY;

-- Create RLS policy: users can only see their own trained models
CREATE POLICY "Users can view their own trained models" ON public.trained_models
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own trained models" ON public.trained_models
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own trained models" ON public.trained_models
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own trained models" ON public.trained_models
  FOR DELETE USING (auth.uid() = user_id);
