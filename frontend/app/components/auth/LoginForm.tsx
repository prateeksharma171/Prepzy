'use client';

import { useState } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getErrorMessage } from '../../lib/axios';
import Spinner from '../Spinner';

interface LoginFormValues {
  identifier: string;
  password: string;
  rememberMe: boolean;
}

const validationSchema = Yup.object({
  identifier: Yup.string().required('Email or username is required'),
  password: Yup.string().required('Password is required'),
  rememberMe: Yup.boolean(),
});

const inputClasses =
  'w-full rounded-xl bg-zinc-900/60 border border-zinc-700 px-3.5 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-colors duration-200';

export default function LoginForm() {
  const { login, closeAuthDialog } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const formik = useFormik<LoginFormValues>({
    initialValues: { identifier: '', password: '', rememberMe: false },
    validationSchema,
    onSubmit: async (values, { setSubmitting }) => {
      setFormError(null);
      try {
        await login(values.identifier, values.password);
        closeAuthDialog();
      } catch (error) {
        setFormError(getErrorMessage(error, 'Unable to log in'));
      } finally {
        setSubmitting(false);
      }
    },
  });

  return (
    <div>
      <h2 className="text-2xl font-bold text-white text-center">Welcome Back</h2>
      <p className="mt-2 text-sm text-zinc-400 text-center">
        Enter your email and password to access your account.
      </p>

      <form onSubmit={formik.handleSubmit} className="mt-6 space-y-4">
        {formError && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-sm text-red-400">
            {formError}
          </div>
        )}

        <div>
          <label htmlFor="identifier" className="block text-sm font-medium text-zinc-300 mb-1.5">
            Email
          </label>
          <input
            id="identifier"
            name="identifier"
            type="text"
            autoComplete="username"
            placeholder="you@example.com"
            value={formik.values.identifier}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            className={inputClasses}
          />
          {formik.touched.identifier && formik.errors.identifier && (
            <p className="mt-1 text-xs text-red-400">{formik.errors.identifier}</p>
          )}
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-zinc-300 mb-1.5">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
              value={formik.values.password}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              className={`${inputClasses} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-zinc-500 hover:text-zinc-300"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {formik.touched.password && formik.errors.password && (
            <p className="mt-1 text-xs text-red-400">{formik.errors.password}</p>
          )}
        </div>

        <div className="flex items-center justify-between text-sm pt-1">
          <label className="flex items-center gap-2 text-zinc-400 cursor-pointer select-none">
            <input
              type="checkbox"
              name="rememberMe"
              checked={formik.values.rememberMe}
              onChange={formik.handleChange}
              className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0"
            />
            Remember Me
          </label>
          <button type="button" className="text-emerald-400 hover:text-emerald-300 font-medium">
            Forgot Your Password?
          </button>
        </div>

        <button
          type="submit"
          disabled={formik.isSubmitting}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 hover:bg-emerald-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {formik.isSubmitting && <Spinner className="w-4 h-4" />}
          {formik.isSubmitting ? 'Logging in...' : 'Log In'}
        </button>
      </form>
    </div>
  );
}
