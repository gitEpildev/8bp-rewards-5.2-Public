import { Message, EmbedBuilder } from 'discord.js';
import { databaseService } from '../services/database';
import { roleManager } from '../services/roleManager';
import { rankMatcher } from '../services/rankMatcher';
import { logger } from '../services/logger';

/**
 * !fixroles - Update all users' Discord roles based on their highest level account
 * Admin-only command
 */
export async function handleFixRoles(message: Message): Promise<boolean> {
  try {
    await message.reply('🔄 Starting role fix for all users...');

    // Get all users with their highest level accounts using the leaderboard
    const leaderboard = await databaseService.getLeaderboard(1000, 'level'); // Get up to 1000 users
    
    let fixedCount = 0;
    let errorCount = 0;
    const results: string[] = [];

    // Process each user
    for (const entry of leaderboard) {
      if (!entry.highest_level) continue;

      try {
        // Get guild member
        const member = await message.guild?.members.fetch(entry.discord_id);
        if (!member) {
          logger.warn('Member not found in guild during role fix', { discord_id: entry.discord_id });
          continue;
        }

        // Get user's accounts to determine rank
        const userAccounts = await databaseService.getUserAccounts(entry.discord_id);
        if (userAccounts.length === 0) {
          continue;
        }

        // Find highest level account
        const highestAccount = userAccounts.reduce((highest, account) => 
          account.level > highest.level ? account : highest,
          userAccounts[0]
        );

        // Get rank config
        const rank = rankMatcher.getRankByName(highestAccount.rank_name);
        if (!rank) {
          logger.warn('Rank not found during role fix', { 
            discord_id: entry.discord_id, 
            rank_name: highestAccount.rank_name 
          });
          errorCount++;
          continue;
        }

        // Assign role
        await roleManager.assignRankRole(member, rank);
        fixedCount++;

        if (userAccounts.length > 1) {
          results.push(`✅ ${member.user.username} → ${highestAccount.rank_name} (Level ${highestAccount.level})`);
        }

        logger.info('Role fixed for user', {
          discord_id: entry.discord_id,
          username: member.user.username,
          highest_level: highestAccount.level,
          highest_rank: highestAccount.rank_name,
          account_count: userAccounts.length,
        });

      } catch (error) {
        logger.error('Error fixing role for user', { discord_id: entry.discord_id, error });
        errorCount++;
      }
    }

    // Send summary
    const embed = new EmbedBuilder()
      .setTitle('✅ Role Fix Complete')
      .setDescription(
        `Updated ${fixedCount} user(s) to match their highest level account.\n` +
        (errorCount > 0 ? `\n⚠️ ${errorCount} error(s) occurred.` : '')
      )
      .setColor(0x00AE86)
      .setTimestamp();

    if (results.length > 0) {
      // Show first 10 multi-account users that were updated
      embed.addFields({
        name: 'Multi-Account Users Updated',
        value: results.slice(0, 10).join('\n') + (results.length > 10 ? `\n...and ${results.length - 10} more` : ''),
        inline: false,
      });
    }

    await message.reply({ embeds: [embed] });
    return true;

  } catch (error) {
    logger.error('Error in fixroles command', { error });
    await message.reply('❌ An error occurred while fixing roles. Check logs for details.');
    return true;
  }
}
