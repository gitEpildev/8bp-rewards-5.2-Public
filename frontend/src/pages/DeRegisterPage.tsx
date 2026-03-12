import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { toast } from 'react-hot-toast';
import axios from 'axios';
import { UserMinus, CheckCircle, AlertCircle, Copy } from 'lucide-react';
import { API_ENDPOINTS } from '../config/api';

interface DeRegisterForm {
  full_name: string;
  eight_ball_pool_id: string;
  email: string;
}

const DeRegisterPage: React.FC = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [requestNumber, setRequestNumber] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<DeRegisterForm>();

  const onSubmit = async (data: DeRegisterForm) => {
    setIsSubmitting(true);

    try {
      const response = await axios.post(API_ENDPOINTS.DEREGISTER, data);

      if (response.status === 201) {
        setRequestNumber(response.data.requestNumber);
        setIsSuccess(true);
        toast.success('Deregistration request submitted successfully.');
        reset();
      }
    } catch (error: any) {
      if (error.response?.status === 409) {
        toast.error('A pending deregistration request already exists for this ID.');
      } else if (error.response?.data?.error) {
        toast.error(error.response.data.error);
      } else {
        toast.error('Failed to submit request. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyRequestNumber = () => {
    navigator.clipboard.writeText(requestNumber).then(() => {
      toast.success('Request number copied to clipboard');
    }).catch(() => {
      toast.error('Failed to copy');
    });
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="max-w-md w-full"
        >
          <div className="card text-center">
            <div className="w-16 h-16 bg-green-100 dark:bg-gradient-to-br dark:from-green-500 dark:to-green-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg dark:shadow-green-500/40">
              <CheckCircle className="w-8 h-8 text-green-600 dark:text-white" />
            </div>
            <h2 className="text-2xl font-bold text-text-primary dark:text-text-dark-primary mb-2">
              Request Submitted!
            </h2>
            <p className="text-text-secondary dark:text-text-dark-secondary mb-4">
              Your deregistration request has been received and is pending review.
            </p>
            <div className="flex items-center justify-center gap-2 mb-6">
              <span className="text-lg font-mono font-bold text-primary-600 dark:text-primary-400">
                {requestNumber}
              </span>
              <button
                onClick={copyRequestNumber}
                className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-background-dark-tertiary transition-colors"
                title="Copy request number"
              >
                <Copy className="w-4 h-4 text-text-secondary dark:text-text-dark-secondary" />
              </button>
            </div>
            <p className="text-sm text-text-secondary dark:text-text-dark-secondary mb-6">
              A confirmation email has been sent. You will be notified once your request is reviewed.
            </p>
            <button
              onClick={() => { setIsSuccess(false); setRequestNumber(''); }}
              className="btn-primary"
            >
              Submit Another Request
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="max-w-lg w-full"
      >
        <div className="card">
          <div className="text-center mb-10">
            <div className="w-16 h-16 bg-amber-100 dark:bg-gradient-to-br dark:from-amber-500 dark:to-amber-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg dark:shadow-amber-500/40">
              <UserMinus className="w-8 h-8 text-amber-600 dark:text-white" />
            </div>
            <h1 className="text-2xl font-bold text-text-primary dark:text-text-dark-primary mb-2">
              Deregister Your Account
            </h1>
            <p className="text-text-secondary dark:text-text-dark-secondary">
              Submit a request to remove your account from the reward system.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label htmlFor="full_name" className="label">
                Full Name
              </label>
              <input
                {...register('full_name', {
                  required: 'Full name is required',
                  minLength: { value: 1, message: 'Full name must not be empty' },
                  maxLength: { value: 100, message: 'Full name must be less than 100 characters' },
                })}
                type="text"
                id="full_name"
                className={`input ${errors.full_name ? 'border-red-500' : ''}`}
                placeholder="Your full name"
              />
              {errors.full_name && (
                <div className="flex items-center space-x-1 mt-1 text-red-600 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  <span>{errors.full_name.message}</span>
                </div>
              )}
            </div>

            <div>
              <label htmlFor="eight_ball_pool_id" className="label">
                Unique ID Number
              </label>
              <input
                {...register('eight_ball_pool_id', {
                  required: '8 Ball Pool ID is required',
                  pattern: {
                    value: /^\d+$/,
                    message: '8 Ball Pool ID must be numeric only',
                  },
                })}
                type="text"
                id="eight_ball_pool_id"
                className={`input ${errors.eight_ball_pool_id ? 'border-red-500' : ''}`}
                placeholder="e.g., 1826254746"
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/[^0-9]/g, '');
                  e.target.value = cleaned;
                }}
              />
              {errors.eight_ball_pool_id && (
                <div className="flex items-center space-x-1 mt-1 text-red-600 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  <span>{errors.eight_ball_pool_id.message}</span>
                </div>
              )}
            </div>

            <div>
              <label htmlFor="email" className="label">
                Email Address
              </label>
              <input
                {...register('email', {
                  required: 'Email address is required',
                  pattern: {
                    value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                    message: 'Please enter a valid email address',
                  },
                })}
                type="email"
                id="email"
                className={`input ${errors.email ? 'border-red-500' : ''}`}
                placeholder="your@email.com"
              />
              {errors.email && (
                <div className="flex items-center space-x-1 mt-1 text-red-600 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  <span>{errors.email.message}</span>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary w-full"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Deregistration Request'}
            </button>
          </form>

          <div className="mt-8 p-4 bg-amber-50 dark:bg-gradient-to-br dark:from-background-dark-tertiary dark:to-background-dark-quaternary rounded-lg border border-transparent dark:border-dark-accent-navy shadow-lg dark:shadow-dark-accent-navy/20">
            <h3 className="text-sm font-medium text-amber-800 dark:text-text-dark-primary mb-2">
              What happens next:
            </h3>
            <ol className="text-sm text-amber-700 dark:text-text-dark-secondary space-y-1">
              <li>1. You will receive a confirmation email with your request number</li>
              <li>2. An admin will review your request</li>
              <li>3. You will be notified once the request is approved or denied</li>
              <li>4. If approved, your ID will be removed from the system</li>
            </ol>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default DeRegisterPage;
