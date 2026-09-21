import type { FC } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import Icon from './Icon'
import FollowButton from './FollowButton'

interface CreatorCardProps {
  name: string
  avatar?: string | null
  bio?: string
  filmCount?: number
  followers?: number
  location?: string
  creatorId?: string
  className?: string
}

const CreatorCard: FC<CreatorCardProps> = ({
  name,
  avatar,
  bio = 'Independent filmmaker',
  filmCount = 0,
  followers = 0,
  location,
  creatorId,
  className = '',
}) => {
  const navigate = useNavigate()
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      className={`bg-surface-card border border-white/10 rounded-2xl p-5 ${className} ${creatorId ? 'cursor-pointer' : ''}`}
      onClick={() => creatorId && navigate(`/creators/${creatorId}`)}
    >
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-accent to-accent-secondary-light flex items-center justify-center text-white text-xl font-bold shrink-0">
          {avatar ? (
            <img src={avatar} alt={name} className="w-full h-full rounded-full object-cover" />
          ) : (
            name.charAt(0).toUpperCase()
          )}
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-white truncate">{name}</h3>
          <p className="text-xs text-gray-400 truncate">{bio}</p>
        </div>
      </div>

      <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/10">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <Icon name="movie" size="sm" />
          <span>{filmCount} films</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <Icon name="group" size="sm" />
          <span>{followers}</span>
        </div>
        {location && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Icon name="location_on" size="sm" />
            <span>{location}</span>
          </div>
        )}
      </div>

      {creatorId && (
        <div className="mt-3">
          <FollowButton creatorId={creatorId} />
        </div>
      )}
    </motion.div>
  )
}

export default CreatorCard
