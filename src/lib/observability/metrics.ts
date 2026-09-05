import { logger } from './logger';

export const metrics = {
  increment: (metricName: string, tags: Record<string, string> = {}) => {
    logger.info('metric_increment', { metric: metricName, value: 1, tags });
  },
  observe: (metricName: string, value: number, tags: Record<string, string> = {}) => {
    logger.info('metric_observe', { metric: metricName, value, tags });
  }
};
