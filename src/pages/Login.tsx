import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { User, Lock } from 'lucide-react';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { useGuestOnly } from '../hooks/useGuestOnly';
import { Alert, Button, Input, LoadingSpinner } from '../components/ui';

interface LoginFormInputs {
  email: string;
  password: string;
}

export function Login() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginFormInputs>();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useGuestOnly();

  const onSubmit = async (data: LoginFormInputs) => {
    setErrorMessage(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    navigate('/');
  };

  if (loading) {
    return (
      <div className="login-bg">
        <LoadingSpinner />
      </div>
    );
  }

  if (user) return null;

  return (
    <div className="login-bg p-4">
      <div className="login-card">
        <div className="mb-8 text-center">
          <img src="/shoe_gallery.jpeg" alt="Shoe Gallery Logo" className="glass-icon mx-auto mb-4 h-14 w-14 rounded-2xl object-cover" />
          <h1 className="bg-gradient-to-br from-white to-white/60 bg-clip-text text-2xl font-bold text-transparent">
            Shoe Gallery
          </h1>
          <p className="mt-1 text-dashboard-text-sub">Sign in to your account</p>
        </div>

        {errorMessage && <Alert message={errorMessage} />}

        <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-4">
          <div className="relative">
            <User className="absolute left-3 top-9 text-dashboard-text-sub" size={20} />
            <Input
              id="email"
              type="email"
              label="Email"
              placeholder="you@example.com"
              className="pl-10"
              error={errors.email?.message}
              {...register('email', { required: 'Email is required' })}
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-3 top-9 text-dashboard-text-sub" size={20} />
            <Input
              id="password"
              type="password"
              label="Password"
              placeholder="••••••••"
              className="pl-10"
              error={errors.password?.message}
              {...register('password', { required: 'Password is required' })}
            />
          </div>

          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>
      </div>
    </div>
  );
}
