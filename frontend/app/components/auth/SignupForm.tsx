'use client';

import { useState } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getErrorMessage } from '../../lib/axios';
import Spinner from '../Spinner';

interface SignupFormValues {
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  password: string;
  confirmPassword: string;
}

const USERNAME_PATTERN = /^[a-zA-Z0-9_]+$/;

const validationSchema = Yup.object({
  email: Yup.string().email('Enter a valid email').required('Email is required'),
  username: Yup.string()
    .min(3, 'Must be at least 3 characters')
    .max(50, 'Must be at most 50 characters')
    .matches(USERNAME_PATTERN, 'Only letters, digits, and underscores are allowed')
    .required('Username is required'),
  firstName: Yup.string().max(255, 'Too long'),
  lastName: Yup.string().max(255, 'Too long'),
  password: Yup.string()
    .min(8, 'Must be at least 8 characters')
    .max(128, 'Must be at most 128 characters')
    .matches(/[a-z]/, 'Must contain a lowercase letter')
    .matches(/[A-Z]/, 'Must contain an uppercase letter')
    .matches(/\d/, 'Must contain a digit')
    .required('Password is required'),
  confirmPassword: Yup.string()
    .oneOf([Yup.ref('password')], 'Passwords must match')
    .required('Please confirm your password'),
});

const inputClasses =
  'w-full rounded-xl bg-zinc-900/60 border border-zinc-700 px-3.5 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-colors duration-200';

export default function SignupForm() {
  const { signup, closeAuthDialog } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const formik = useFormik<SignupFormValues>({
    initialValues: {
      email: '',
      username: '',
      firstName: '',
      lastName: '',
      password: '',
      confirmPassword: '',
    },
    validationSchema,
    onSubmit: async (values, { setSubmitting }) => {
      setFormError(null);
      try {
        await signup({
          email: values.email,
          username: values.username,
          password: values.password,
          first_name: values.firstName || undefined,
          last_name: values.lastName || undefined,
        });
        closeAuthDialog();
      } catch (error) {
        setFormError(getErrorMessage(error, 'Unable to sign up'));
      } finally {
        setSubmitting(false);
      }
    },
  });

  return (
    <div>
      <h2 className="text-2xl font-bold text-white text-center">Create Account</h2>
      <p className="mt-2 text-sm text-zinc-400 text-center">Enter your details to get started.</p>

      <form onSubmit={formik.handleSubmit} className="mt-6 space-y-4">
        {formError && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-sm text-red-400">
            {formError}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="firstName" className="block text-sm font-medium text-zinc-300 mb-1.5">
              First name
            </label>
            <input
              id="firstName"
              name="firstName"
              type="text"
              placeholder="Ravi"
              value={formik.values.firstName}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              className={inputClasses}
            />
            {formik.touched.firstName && formik.errors.firstName && (
              <p className="mt-1 text-xs text-red-400">{formik.errors.firstName}</p>
            )}
          </div>
          <div>
            <label htmlFor="lastName" className="block text-sm font-medium text-zinc-300 mb-1.5">
              Last name
            </label>
            <input
              id="lastName"
              name="lastName"
              type="text"
              placeholder="Rathore"
              value={formik.values.lastName}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              className={inputClasses}
            />
            {formik.touched.lastName && formik.errors.lastName && (
              <p className="mt-1 text-xs text-red-400">{formik.errors.lastName}</p>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-zinc-300 mb-1.5">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={formik.values.email}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            className={inputClasses}
          />
          {formik.touched.email && formik.errors.email && (
            <p className="mt-1 text-xs text-red-400">{formik.errors.email}</p>
          )}
        </div>

        <div>
          <label htmlFor="username" className="block text-sm font-medium text-zinc-300 mb-1.5">
            Username
          </label>
          <input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            placeholder="ravi_r"
            value={formik.values.username}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            className={inputClasses}
          />
          {formik.touched.username && formik.errors.username && (
            <p className="mt-1 text-xs text-red-400">{formik.errors.username}</p>
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
              autoComplete="new-password"
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

        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-zinc-300 mb-1.5">
            Confirm password
          </label>
          <div className="relative">
            <input
              id="confirmPassword"
              name="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="••••••••"
              value={formik.values.confirmPassword}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              className={`${inputClasses} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((prev) => !prev)}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-zinc-500 hover:text-zinc-300"
              tabIndex={-1}
            >
              {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {formik.touched.confirmPassword && formik.errors.confirmPassword && (
            <p className="mt-1 text-xs text-red-400">{formik.errors.confirmPassword}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={formik.isSubmitting}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 hover:bg-emerald-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {formik.isSubmitting && <Spinner className="w-4 h-4" />}
          {formik.isSubmitting ? 'Creating account...' : 'Sign Up'}
        </button>
      </form>
    </div>
  );
}
