import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { toast } from 'react-hot-toast';
import axios from 'axios';
import { Mail, Send, CheckCircle, AlertCircle, X, Paperclip } from 'lucide-react';
import { API_ENDPOINTS } from '../config/api';

interface ContactForm {
  name: string;
  email: string;
  subject: string;
  message: string;
}

interface FileWithPreview extends File {
  preview?: string;
}

const ContactPage: React.FC = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<FileWithPreview[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [systemStatus, setSystemStatus] = useState<{ api: string; database: string; scheduler: string }>({
    api: 'Checking...', database: 'Checking...', scheduler: 'Checking...'
  });

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const [statusRes, schedulerRes] = await Promise.allSettled([
          axios.get(API_ENDPOINTS.STATUS, { timeout: 5000 }),
          axios.get(API_ENDPOINTS.STATUS_SCHEDULER, { timeout: 5000 })
        ]);
        const statusData = statusRes.status === 'fulfilled' ? statusRes.value.data : null;
        const schedulerData = schedulerRes.status === 'fulfilled' ? schedulerRes.value.data : null;
        setSystemStatus({
          api: statusData ? 'Online' : 'Unavailable',
          database: statusData?.database?.connected ? 'Connected' : 'Disconnected',
          scheduler: schedulerData?.status === 'running' ? 'Active' : schedulerData ? 'Inactive' : 'Unknown'
        });
      } catch {
        setSystemStatus({ api: 'Unavailable', database: 'Unknown', scheduler: 'Unknown' });
      }
    };
    checkStatus();
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ContactForm>();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setFileError(null);
    
    // Validate files
    const maxSize = 10 * 1024 * 1024; // 10MB
    const allowedTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'text/plain', 'text/csv',
      'application/zip', 'application/x-zip-compressed',
      'application/x-rar-compressed', 'application/vnd.rar'
    ];
    
    const validFiles: FileWithPreview[] = [];
    const errors: string[] = [];
    
    files.forEach((file) => {
      if (file.size > maxSize) {
        errors.push(`${file.name} exceeds 10MB limit`);
        return;
      }
      if (!allowedTypes.includes(file.type)) {
        errors.push(`${file.name} is not an allowed file type`);
        return;
      }
      validFiles.push(file);
    });
    
    if (errors.length > 0) {
      setFileError(errors.join(', '));
      return;
    }
    
    if (selectedFiles.length + validFiles.length > 5) {
      setFileError('Maximum 5 files allowed');
      return;
    }
    
    setSelectedFiles([...selectedFiles, ...validFiles]);
  };
  
  const removeFile = (index: number) => {
    setSelectedFiles(selectedFiles.filter((_, i) => i !== index));
  };
  
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const onSubmit = async (data: ContactForm) => {
    setIsSubmitting(true);
    setFileError(null);
    
    try {
      const formData = new FormData();
      formData.append('name', data.name);
      formData.append('email', data.email);
      formData.append('subject', data.subject);
      formData.append('message', data.message);
      
      // Append files
      selectedFiles.forEach((file) => {
        formData.append('attachments', file);
      });
      
      const response = await axios.post(API_ENDPOINTS.CONTACT, formData, {
        withCredentials: true,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      
      if (response.status === 200) {
        setIsSuccess(true);
        const ticketNumber = response.data.ticketNumber;
        toast.success(
          ticketNumber 
            ? `Message sent successfully! Ticket: ${ticketNumber}`
            : 'Message sent successfully! We\'ll get back to you soon.'
        );
        reset();
        setSelectedFiles([]);
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || error.message || 'Failed to send message. Please try again.';
      console.error('Contact form error:', error.response?.data || error);
      toast.error(errorMessage, { duration: 5000 });
      if (errorMessage.includes('file type') || errorMessage.includes('file size')) {
        setFileError(errorMessage);
      }
      // Set form errors if validation failed
      if (error.response?.data?.error) {
        if (error.response.data.error.includes('Message must be between')) {
          // This will be caught by react-hook-form validation, but we show toast too
        }
        if (error.response.data.error.includes('Missing required fields')) {
          toast.error('Please fill in all required fields', { duration: 5000 });
        }
      }
    } finally {
      setIsSubmitting(false);
    }
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
              Message Sent!
            </h2>
            <p className="text-text-secondary dark:text-text-dark-secondary mb-6">
              Thank you for contacting us. We'll get back to you as soon as possible.
            </p>
            <button
              onClick={() => setIsSuccess(false)}
              className="btn-primary"
            >
              Send Another Message
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-16 sm:py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <div className="w-16 h-16 bg-primary-100 dark:bg-gradient-to-br dark:from-blue-500 dark:to-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg dark:shadow-blue-500/40">
            <Mail className="w-8 h-8 text-primary-600 dark:text-text-dark-highlight" />
          </div>
          <h1 className="text-3xl font-bold text-text-primary mb-4">
            Contact Us
          </h1>
          <p className="text-lg text-text-secondary max-w-2xl mx-auto">
            Have questions about the 8 Ball Pool Rewards system? 
            We're here to help! Send us a message and we'll get back to you.
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12">
          {/* Contact Form */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="card"
          >
            <h2 className="text-xl font-semibold text-text-primary mb-6">
              Send us a Message
            </h2>
            
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div>
                <label htmlFor="name" className="label">
                  Your Name
                </label>
                <input
                  {...register('name', {
                    required: 'Name is required',
                    minLength: {
                      value: 2,
                      message: 'Name must be at least 2 characters',
                    },
                  })}
                  type="text"
                  id="name"
                  className={`input ${errors.name ? 'border-red-500' : ''}`}
                  placeholder="Enter your name"
                />
                {errors.name && (
                  <div className="flex items-center space-x-1 mt-1 text-red-600 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    <span>{errors.name.message}</span>
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="email" className="label">
                  Email Address
                </label>
                <input
                  {...register('email', {
                    required: 'Email is required',
                    pattern: {
                      value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                      message: 'Please enter a valid email address',
                    },
                  })}
                  type="email"
                  id="email"
                  className={`input ${errors.email ? 'border-red-500' : ''}`}
                  placeholder="your.email@example.com"
                />
                {errors.email && (
                  <div className="flex items-center space-x-1 mt-1 text-red-600 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    <span>{errors.email.message}</span>
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="subject" className="label">
                  Subject
                </label>
                <input
                  {...register('subject', {
                    required: 'Subject is required',
                    minLength: {
                      value: 3,
                      message: 'Subject must be at least 3 characters',
                    },
                    maxLength: {
                      value: 100,
                      message: 'Subject must be less than 100 characters',
                    },
                  })}
                  type="text"
                  id="subject"
                  className={`input ${errors.subject ? 'border-red-500' : ''}`}
                  placeholder="What is this regarding?"
                />
                {errors.subject && (
                  <div className="flex items-center space-x-1 mt-1 text-red-600 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    <span>{errors.subject.message}</span>
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="message" className="label">
                  Message
                </label>
                <textarea
                  {...register('message', {
                    required: 'Message is required',
                    minLength: {
                      value: 10,
                      message: 'Message must be at least 10 characters',
                    },
                    maxLength: {
                      value: 1000,
                      message: 'Message must be less than 1000 characters',
                    },
                  })}
                  id="message"
                  rows={6}
                  className={`input resize-none ${errors.message ? 'border-red-500' : ''}`}
                  placeholder="Tell us how we can help you..."
                />
                {errors.message && (
                  <div className="flex items-center space-x-1 mt-1 text-red-600 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    <span>{errors.message.message}</span>
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="attachments" className="label">
                  Attachments (Optional)
                </label>
                <div className="mt-1">
                  <label
                    htmlFor="attachments"
                    className="flex items-center justify-center w-full px-4 py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:border-primary-500 dark:hover:border-primary-400 transition-colors"
                  >
                    <Paperclip className="w-5 h-5 mr-2 text-gray-400" />
                    <span className="text-sm text-text-secondary">
                      Click to upload files (Max 10MB each, up to 5 files)
                    </span>
                    <input
                      id="attachments"
                      type="file"
                      multiple
                      accept="image/*,.pdf,.txt,.csv,.zip,.rar"
                      onChange={handleFileChange}
                      className="hidden"
                      disabled={isSubmitting}
                    />
                  </label>
                </div>
                {fileError && (
                  <div className="flex items-center space-x-1 mt-2 text-red-600 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    <span>{fileError}</span>
                  </div>
                )}
                {selectedFiles.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {selectedFiles.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-2 bg-gray-50 dark:bg-white/5 rounded-lg"
                      >
                        <div className="flex items-center space-x-2 flex-1 min-w-0">
                          <Paperclip className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <span className="text-sm text-text-secondary truncate">{file.name}</span>
                          <span className="text-xs text-gray-400 flex-shrink-0">
                            ({formatFileSize(file.size)})
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFile(index)}
                          className="ml-2 p-1 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                          disabled={isSubmitting}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <p className="mt-2 text-xs text-text-secondary">
                  Allowed: Images, PDFs, text files, ZIP/RAR archives
                </p>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-primary w-full inline-flex items-center justify-center space-x-2"
              >
                <Send className="w-4 h-4" />
                <span>{isSubmitting ? 'Sending...' : 'Send Message'}</span>
              </button>
            </form>
          </motion.div>

          {/* Contact Information */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="space-y-6 lg:space-y-8"
          >
            <div className="card">
              <h3 className="text-lg font-semibold text-text-primary mb-4">
                Get in Touch
              </h3>
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <Mail className="w-5 h-5 text-primary-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-text-primary">Email Support</p>
                    <p className="text-text-secondary text-sm">
                      We typically respond within 24 hours
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="card">
              <h3 className="text-lg font-semibold text-text-primary mb-4">
                Frequently Asked Questions
              </h3>
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-text-primary mb-1">
                    How often are rewards claimed?
                  </h4>
                  <p className="text-text-secondary text-sm">
                    Our system automatically claims rewards every 6 hours at 00:00, 06:00, 12:00, and 18:00 UTC.
                  </p>
                </div>
                <div>
                  <h4 className="font-medium text-text-primary mb-1">
                    Is my account information safe?
                  </h4>
                  <p className="text-text-secondary text-sm">
                    Yes, we use secure PostgreSQL database and only store your 8BP ID and username.
                  </p>
                </div>
                <div>
                  <h4 className="font-medium text-text-primary mb-1">
                    Can I register multiple accounts?
                  </h4>
                  <p className="text-text-secondary text-sm">
                    Yes, you can register multiple 8 Ball Pool accounts for automated reward claiming.
                  </p>
                </div>
              </div>
            </div>

            <div className="card">
              <h3 className="text-lg font-semibold text-text-primary dark:text-text-dark-primary mb-4">
                System Status
              </h3>
              <div className="space-y-2">
                {[
                  { label: 'Backend API', value: systemStatus.api, ok: systemStatus.api === 'Online' },
                  { label: 'Database', value: systemStatus.database, ok: systemStatus.database === 'Connected' },
                  { label: 'Scheduler', value: systemStatus.scheduler, ok: systemStatus.scheduler === 'Active' },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between">
                    <span className="text-text-secondary dark:text-text-dark-secondary">{item.label}</span>
                    <span className={`text-sm font-medium ${
                      item.value === 'Checking...' ? 'text-yellow-500' :
                      item.ok ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'
                    }`}>
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default ContactPage;








