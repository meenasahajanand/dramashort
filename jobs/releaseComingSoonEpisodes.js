const cron = require('node-cron');
const ComingSoonEpisode = require('../models/ComingSoonEpisode');
const ComingSoonSeries = require('../models/ComingSoonSeries');
const Episode = require('../models/Episode');
const Series = require('../models/Series');
const SeriesTransferLog = require('../models/SeriesTransferLog');

/**
 * Cron job to automatically move coming soon episodes to regular episodes
 * when their scheduled release date/time is reached
 * 
 * Runs every minute to check for episodes that need to be released
 */
const releaseComingSoonEpisodes = async () => {
  try {
    const now = new Date();
    
    // Find all pending episodes where scheduledReleaseDate <= now
    const episodesToRelease = await ComingSoonEpisode.find({
      status: 'pending',
      scheduledReleaseDate: { $lte: now }
    });

    if (episodesToRelease.length === 0) {
      return; // No episodes to release
    }

    console.log(`[Cron Job] Found ${episodesToRelease.length} episode(s) ready to release`);

    const released = [];
    const errors = [];

    for (const comingSoonEpisode of episodesToRelease) {
      try {
        let finalSeriesId = comingSoonEpisode.seriesId;

        // If seriesId is missing, try to get it from comingSoonSeriesId via SeriesTransferLog
        // Episodes will ONLY release when their series has been released (handled in releaseComingSoonSeries)
        if (!finalSeriesId && comingSoonEpisode.comingSoonSeriesId) {
          const transferLog = await SeriesTransferLog.findOne({
            comingSoonSeriesId: comingSoonEpisode.comingSoonSeriesId
          });
          
          if (transferLog && transferLog.seriesId) {
            // Series already released, use the seriesId from transfer log
            finalSeriesId = transferLog.seriesId;
            // Update the episode with the resolved seriesId
            await ComingSoonEpisode.findByIdAndUpdate(comingSoonEpisode._id, {
              seriesId: finalSeriesId
            });
            console.log(`[Cron Job] Resolved seriesId ${finalSeriesId} for episode ${comingSoonEpisode._id} from comingSoonSeriesId`);
          } else {
            // Series not released yet - episodes will be released when series is released
            // Don't process episodes independently, they will be handled in releaseComingSoonSeries
            // This is expected behavior - episodes wait for their series to be released
            continue;
          }
        }

        // If still no seriesId, skip (episode needs a series to be released)
        if (!finalSeriesId) {
          console.warn(`[Cron Job] Skipping episode ${comingSoonEpisode._id} because seriesId is missing and no comingSoonSeriesId found`);
          continue;
        }

        // Check if episode already exists in regular episodes
        const existingEpisode = await Episode.findOne({
          seriesId: finalSeriesId,
          episode: comingSoonEpisode.episode
        });

        if (existingEpisode) {
          // Episode already exists, just mark as released and delete from coming soon
          await ComingSoonEpisode.findByIdAndUpdate(comingSoonEpisode._id, {
            status: 'released'
          });
          await ComingSoonEpisode.findByIdAndDelete(comingSoonEpisode._id);
          console.log(`[Cron Job] Episode ${comingSoonEpisode.episode} already exists, removed from coming soon`);
          continue;
        }

        // Create new episode in regular episodes table
        const newEpisode = new Episode({
          seriesId: finalSeriesId,
          episode: comingSoonEpisode.episode,
          title: comingSoonEpisode.title || '',
          coin: comingSoonEpisode.coin || 0,
          views: comingSoonEpisode.views || 0,
          coinEarned: comingSoonEpisode.coinEarned || 0,
          videoUrl: comingSoonEpisode.videoUrl,
          videoThumbnail: comingSoonEpisode.videoThumbnail
        });

        await newEpisode.save();

        // Mark as released and delete from coming soon
        await ComingSoonEpisode.findByIdAndUpdate(comingSoonEpisode._id, {
          status: 'released'
        });
        await ComingSoonEpisode.findByIdAndDelete(comingSoonEpisode._id);

        released.push({
          episodeId: newEpisode._id,
          seriesId: finalSeriesId,
          episode: comingSoonEpisode.episode
        });

        console.log(`[Cron Job] Released episode ${comingSoonEpisode.episode} for series ${finalSeriesId}`);
      } catch (error) {
        // Check if error is due to disk space
        if (error.code === 'ENOSPC') {
          console.error(`[Cron Job] CRITICAL: Disk space full! Cannot release episode ${comingSoonEpisode._id}. Please free up disk space.`);
          // Don't continue processing if disk is full
          break;
        }
        errors.push({
          episodeId: comingSoonEpisode._id,
          error: error.message
        });
        console.error(`[Cron Job] Error releasing episode ${comingSoonEpisode._id}:`, error.message);
      }
    }

    if (released.length > 0) {
      console.log(`[Cron Job] Successfully released ${released.length} episode(s)`);
    }

    if (errors.length > 0) {
      console.error(`[Cron Job] Failed to release ${errors.length} episode(s)`);
    }
  } catch (error) {
    console.error('[Cron Job] Error in releaseComingSoonEpisodes:', error);
  }
};

/**
 * Cron job to automatically move coming soon series to regular series
 * when their scheduled release date/time is reached
 */
const releaseComingSoonSeries = async () => {
  try {
    const now = new Date();
    
    // Find all pending series where scheduledReleaseDate <= now
    const seriesToRelease = await ComingSoonSeries.find({
      status: 'pending',
      scheduledReleaseDate: { $lte: now }
    });

    if (seriesToRelease.length === 0) {
      // Check if there are any pending series scheduled for future (for info)
      const futureSeriesCount = await ComingSoonSeries.countDocuments({
        status: 'pending',
        scheduledReleaseDate: { $gt: now }
      });
      if (futureSeriesCount > 0) {
        // Get next series release date for info
        const nextSeries = await ComingSoonSeries.findOne({
          status: 'pending',
          scheduledReleaseDate: { $gt: now }
        }).sort({ scheduledReleaseDate: 1 }).select('title scheduledReleaseDate');
        
        if (nextSeries) {
          const nextReleaseDate = new Date(nextSeries.scheduledReleaseDate);
          const daysUntilRelease = Math.ceil((nextReleaseDate - now) / (1000 * 60 * 60 * 24));
          console.log(`[Cron Job] No series ready to release. Next series "${nextSeries.title}" scheduled for ${nextReleaseDate.toLocaleString()} (${daysUntilRelease} day(s) remaining)`);
        }
      }
      return; // No series to release
    }

    console.log(`[Cron Job] Found ${seriesToRelease.length} coming soon series ready to release`);

    const released = [];
    const errors = [];

    for (const comingSoonSeries of seriesToRelease) {
      try {
        // Create new series in regular series table
        const newSeries = new Series({
          title: comingSoonSeries.title,
          description: comingSoonSeries.description,
          totalEpisode: comingSoonSeries.totalEpisode,
          freeEpisode: comingSoonSeries.freeEpisode,
          free: comingSoonSeries.free,
          membersOnly: comingSoonSeries.membersOnly,
          type: comingSoonSeries.type,
          active: comingSoonSeries.active,
          category: comingSoonSeries.category,
          tags: comingSoonSeries.tags,
          image: comingSoonSeries.image,
          banner: comingSoonSeries.banner,
          rating: comingSoonSeries.rating || 0,
          viewCount: 0
        });

        await newSeries.save();

        // Attach newly created seriesId to any coming-soon episodes tied to this comingSoonSeries
        await ComingSoonEpisode.updateMany(
          { comingSoonSeriesId: comingSoonSeries._id },
          { $set: { seriesId: newSeries._id } }
        );

        // Log the transfer
        await SeriesTransferLog.create({
          comingSoonSeriesId: comingSoonSeries._id,
          seriesId: newSeries._id,
          title: newSeries.title,
          scheduledReleaseDate: comingSoonSeries.scheduledReleaseDate,
          transferredAt: new Date()
        });

        // Mark as released and delete from coming soon
        await ComingSoonSeries.findByIdAndUpdate(comingSoonSeries._id, {
          status: 'released'
        });
        await ComingSoonSeries.findByIdAndDelete(comingSoonSeries._id);

        released.push({
          seriesId: newSeries._id,
          title: newSeries.title
        });

        console.log(`[Cron Job] Released series "${newSeries.title}" (ID: ${newSeries._id}) from coming soon to regular series`);

        // Now release ALL episodes for this series (regardless of their scheduled date)
        // When series releases, all its episodes should be released together
        const episodesToRelease = await ComingSoonEpisode.find({
          $or: [
            { seriesId: newSeries._id },
            { comingSoonSeriesId: comingSoonSeries._id }
          ],
          status: 'pending'
        });

        if (episodesToRelease.length > 0) {
          console.log(`[Cron Job] Releasing ${episodesToRelease.length} episode(s) for series "${newSeries.title}"`);
          
          for (const episode of episodesToRelease) {
            try {
              // Check if episode already exists in regular episodes
              const existingEpisode = await Episode.findOne({
                seriesId: newSeries._id,
                episode: episode.episode
              });

              if (existingEpisode) {
                // Episode already exists, just mark as released and delete from coming soon
                await ComingSoonEpisode.findByIdAndUpdate(episode._id, {
                  status: 'released'
                });
                await ComingSoonEpisode.findByIdAndDelete(episode._id);
                console.log(`[Cron Job] Episode ${episode.episode} already exists, removed from coming soon`);
                continue;
              }

              // Create new episode in regular episodes table
              const newEpisode = new Episode({
                seriesId: newSeries._id,
                episode: episode.episode,
                title: episode.title || '',
                coin: episode.coin || 0,
                views: episode.views || 0,
                coinEarned: episode.coinEarned || 0,
                videoUrl: episode.videoUrl,
                videoThumbnail: episode.videoThumbnail
              });

              await newEpisode.save();

              // Mark as released and delete from coming soon
              await ComingSoonEpisode.findByIdAndUpdate(episode._id, {
                status: 'released'
              });
              await ComingSoonEpisode.findByIdAndDelete(episode._id);

              console.log(`[Cron Job] Released episode ${episode.episode} for series "${newSeries.title}"`);
            } catch (episodeError) {
              console.error(`[Cron Job] Error releasing episode ${episode._id} for series "${newSeries.title}":`, episodeError.message);
            }
          }
        }
      } catch (error) {
        // Check if error is due to disk space
        if (error.code === 'ENOSPC') {
          console.error(`[Cron Job] CRITICAL: Disk space full! Cannot release series ${comingSoonSeries._id}. Please free up disk space.`);
          // Don't continue processing if disk is full
          break;
        }
        errors.push({
          seriesId: comingSoonSeries._id,
          error: error.message
        });
        console.error(`[Cron Job] Error releasing series ${comingSoonSeries._id}:`, error.message);
      }
    }

    if (released.length > 0) {
      console.log(`[Cron Job] Successfully released ${released.length} coming soon series`);
    }

    if (errors.length > 0) {
      console.error(`[Cron Job] Failed to release ${errors.length} coming soon series`);
    }
  } catch (error) {
    console.error('[Cron Job] Error in releaseComingSoonSeries:', error);
  }
};

// Schedule cron job to run every minute
// Format: second minute hour day month dayOfWeek
// '* * * * *' means every minute
const startCronJob = () => {
  console.log('[Cron Job] Starting coming soon episodes and series release scheduler...');
  
  // Run every minute — release series first, then episodes
  cron.schedule('* * * * *', async () => {
    await releaseComingSoonSeries();
    await releaseComingSoonEpisodes();
  });

  // Also run immediately on startup to catch any missed releases
  releaseComingSoonSeries();
  releaseComingSoonEpisodes();

  console.log('[Cron Job] Coming soon episodes and series release scheduler started (runs every minute)');
};

module.exports = {
  startCronJob,
  releaseComingSoonEpisodes,
  releaseComingSoonSeries
};

