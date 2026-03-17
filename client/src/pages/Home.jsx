import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Globe } from 'lucide-react';

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

export default function Home() {
  return (
    <div className="page-container space-y-16">
      {/* Hero */}
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="relative pt-8 pb-4 text-center"
      >
        {/* Background Glow */}
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary-500/[0.07] rounded-full blur-[120px]" />
        </div>

        <motion.div variants={fadeUp} className="inline-block mb-4">
          <span className="px-4 py-1.5 bg-primary-500/10 text-primary-400 rounded-full text-sm font-medium border border-primary-500/20">
            ✨ Hugo Site Builder Platform
          </span>
        </motion.div>

        <motion.h1
          variants={fadeUp}
          className="text-5xl md:text-6xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400"
        >
          Convert Websites to Hugo
          <br />
          <span className="text-primary-400">in Seconds</span>
        </motion.h1>

        <motion.p variants={fadeUp} className="text-xl text-gray-400 mb-8 max-w-2xl mx-auto">
          Enter any website URL and instantly convert it to a Hugo static site.
          Download all pages, assets, and get a production-ready Hugo project.
        </motion.p>

        {/* CTA Buttons */}
        <motion.div
          variants={fadeUp}
          className="flex flex-col sm:flex-row gap-4 justify-center items-center"
        >
          <Link
            to="/fetch"
            className="btn btn-primary px-8 py-3 text-lg flex items-center gap-2 shadow-lg shadow-primary-500/20 hover:shadow-primary-500/40"
          >
            <Globe className="w-5 h-5" />
            Fetch Site from Server
          </Link>
        </motion.div>
      </motion.section>


    </div>
  );
}
